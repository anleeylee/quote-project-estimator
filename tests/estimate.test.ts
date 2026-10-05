import { describe, expect, it } from 'vitest';
import { newProject, ProjectDoc } from '../src/features/project';
import { estimate, resolvePrice, listBillingProfiles } from '../src/features/estimate';
import { quoteTotals } from '../src/features/quote';
import { importMaterials, importPriceList } from '../src/features/materials';

function demoProject(): ProjectDoc {
  const p = newProject('Test', 'Acme');
  p.items = [
    { partId: 'A', partName: 'Top', species: 'Walnut', grade: '', thicknessIn: 2, widthIn: 10, lengthIn: 72, quantity: 1, notes: '' },
    { partId: 'B', partName: 'Side', species: 'Oak', grade: '', thicknessIn: 1, widthIn: 6, lengthIn: 48, quantity: 2, notes: '' },
  ];
  p.priceList = [
    { species: 'Walnut', thicknessIn: 2, pricePerBF: 10 },
    { species: 'Oak', thicknessIn: 1, pricePerBF: 5 },
  ];
  p.settings = { ...p.settings, wasteFactor: 0.15, markupPct: 40, billingProfile: 'exact' };
  return p;
}

describe('estimate', () => {
  it('computes net, gross and charged BF per line', () => {
    const p = demoProject();
    const res = estimate({ items: p.items, priceList: p.priceList, settings: p.settings });
    const walnut = res.lines.find((l) => l.partId === 'A')!;
    // 2×10×72/144 = 10 BF net
    expect(walnut.netBF).toBeCloseTo(10);
    // gross = net × (1+0.15) = 11.5
    expect(walnut.grossBF).toBeCloseTo(11.5);
    // exact billing: charged = gross
    expect(walnut.chargedBF).toBeCloseTo(11.5);
    expect(walnut.lineCost).toBeCloseTo(11.5 * 10);
  });

  it('applies markup to line costs', () => {
    const p = demoProject();
    const res = estimate({ items: p.items, priceList: p.priceList, settings: p.settings });
    const t = res.totals;
    expect(t.costWithMarkup).toBeCloseTo(t.costBeforeMarkup * 1.4);
  });

  it('yield = net/gross', () => {
    const p = demoProject();
    const res = estimate({ items: p.items, priceList: p.priceList, settings: p.settings });
    expect(res.totals.yieldPct).toBeCloseTo((res.totals.netBF / res.totals.grossBF) * 100);
  });

  it('resolves prices by species and thickness', () => {
    expect(resolvePrice([{ species: 'Walnut', thicknessIn: 2, pricePerBF: 10 }], 'Walnut', 2)).toBe(10);
    // fallback to any entry for the species when thickness mismatches
    expect(resolvePrice([{ species: 'Walnut', thicknessIn: 1, pricePerBF: 12 }], 'Walnut', 2)).toBe(12);
    expect(resolvePrice([], 'Walnut', 1)).toBe(0);
  });

  it('lists billing profiles from the shared engine', () => {
    const profiles = listBillingProfiles();
    expect(profiles).toContain('exact');
    expect(profiles.length).toBeGreaterThanOrEqual(8);
  });

  it('billing profile rounds the billed piece, then scales to the purchase quantity', () => {
    const p = demoProject();
    // net = 10 BF, gross = 11.5 BF, billed piece = 10 (already whole) → charged = 11.5
    p.settings.billingProfile = 'whole-bf-per-piece';
    const res = estimate({ items: p.items, priceList: p.priceList, settings: p.settings });
    const walnut = res.lines.find((l) => l.partId === 'A')!;
    expect(walnut.chargedBF).toBeCloseTo(11.5);
  });

  it('a sub-half-board-foot piece is billed up to a whole BF', () => {
    const p = newProject('T');
    p.items = [{ partId: 'X', partName: '', species: 'Oak', grade: '', thicknessIn: 1, widthIn: 4, lengthIn: 30, quantity: 1, notes: '' }];
    p.priceList = [{ species: 'Oak', thicknessIn: 1, pricePerBF: 10 }];
    p.settings = { ...p.settings, wasteFactor: 0, billingProfile: 'whole-bf-per-piece' };
    const res = estimate({ items: p.items, priceList: p.priceList, settings: p.settings });
    // raw piece = 1×4×30/144 = 0.8333 BF → billed 1 BF
    expect(res.lines[0].chargedBF).toBeCloseTo(1);
    expect(res.lines[0].lineCost).toBeCloseTo(10);
  });
});

describe('quote', () => {
  it('computes totals with tax, delivery, fees, discount', () => {
    const p = demoProject();
    p.settings = { ...p.settings, taxRate: 0.07, delivery: 40, fees: 10, discount: 15 };
    const res = estimate({ items: p.items, priceList: p.priceList, settings: p.settings });
    const t = quoteTotals(res, p.settings);
    expect(t.subtotal).toBeCloseTo(res.totals.costWithMarkup);
    expect(t.tax).toBeCloseTo(t.subtotal * 0.07);
    expect(t.total).toBeCloseTo(t.subtotal + t.tax + 40 + 10 - 15);
  });

  it('tax-included prices are not taxed again', () => {
    const p = demoProject();
    p.settings = { ...p.settings, taxRate: 0.07, taxIncluded: true };
    const res = estimate({ items: p.items, priceList: p.priceList, settings: p.settings });
    const t = quoteTotals(res, p.settings);
    expect(t.total).toBeCloseTo(t.subtotal); // no delivery/fees/discount
    expect(t.tax).toBeGreaterThan(0); // tax is shown as the embedded amount
  });
});

describe('imports', () => {
  it('imports material rows with thickness fractions', () => {
    const res = importMaterials([
      ['Part ID', 'Part Name', 'Species', 'Thickness', 'Width', 'Length', 'Qty'],
      ['A', 'Top', 'Walnut', '8/4', 10, 72, 1],
      ['B', 'Side', 'Oak', '4/4', 6, 48, 2],
    ]);
    expect(res.items).toHaveLength(2);
    expect(res.items[0].thicknessIn).toBe(2);
    expect(res.rejected).toHaveLength(0);
  });

  it('imports price lists', () => {
    const res = importPriceList([
      ['Species', 'Thickness', '$/BF'],
      ['Walnut', '8/4', 13.5],
      ['Oak', '4/4', 6.5],
    ]);
    expect(res.items).toHaveLength(2);
    expect(res.items[0].pricePerBF).toBe(13.5);
  });
});
