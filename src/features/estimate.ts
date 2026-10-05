/**
 * estimate.ts — The estimate core.
 *
 * For every material line:
 *   netBF        = board feet of the finished part × quantity
 *   grossBF      = netBF uplifted by the species waste factor (purchase target)
 *   chargedBF    = grossBF re-billed through the dealer's billing profile
 *   pricePerBF   = resolved from the species price list
 *   lineCost     = chargedBF × pricePerBF
 *   costBeforeMarkup / costWithMarkup
 *
 * Totals feed the quote document (tax, delivery, fees, discount).
 */

import { applyBillingProfile, billingProfileById, boardFootForQuantity, purchaseBFWithWaste, roundBF, BILLING_PROFILES } from '../core';
import type { BillingLineInput, BillingProfile } from '../core/boardfoot';
import { MaterialItem, PriceEntry, ProjectSettings } from './project';

export interface SpeciesWaste {
  species: string;
  wasteFactor: number;
}

export interface LineEstimate {
  partId: string;
  partName: string;
  species: string;
  grade: string;
  thicknessIn: number;
  widthIn: number;
  lengthIn: number;
  quantity: number;
  netBF: number;
  wasteFactor: number;
  grossBF: number;
  chargedBF: number;
  pricePerBF: number;
  lineCost: number;
  costWithMarkup: number;
}

export interface EstimateResult {
  settings: ProjectSettings;
  profile: BillingProfile;
  lines: LineEstimate[];
  /** Species-level summary for material planning. */
  speciesSummary: { species: string; thicknessIn: number; netBF: number; grossBF: number; cost: number }[];
  totals: {
    netBF: number;
    grossBF: number;
    chargedBF: number;
    costBeforeMarkup: number;
    markupAmount: number;
    costWithMarkup: number;
    yieldPct: number;
    wasteBF: number;
  };
}

export interface EstimateInput {
  items: MaterialItem[];
  priceList: PriceEntry[];
  settings: ProjectSettings;
  wasteFactors?: SpeciesWaste[];
}

export function resolvePrice(priceList: PriceEntry[], species: string, thicknessIn: number): number {
  const byThickness = priceList.filter(
    (p) => p.species.toLowerCase() === species.toLowerCase() && Math.abs(p.thicknessIn - thicknessIn) < 1e-9,
  );
  if (byThickness.length > 0) return byThickness[0].pricePerBF;
  // Fallback: any price entry for the species, same thickness quarter.
  const quarter = Math.round(thicknessIn * 4);
  const byQuarter = priceList.filter(
    (p) => p.species.toLowerCase() === species.toLowerCase() && Math.round(p.thicknessIn * 4) === quarter,
  );
  if (byQuarter.length > 0) return byQuarter[0].pricePerBF;
  const anySpecies = priceList.filter((p) => p.species.toLowerCase() === species.toLowerCase());
  if (anySpecies.length > 0) return anySpecies[0].pricePerBF;
  return 0;
}

export function estimate(input: EstimateInput): EstimateResult {
  const settings = input.settings;
  const profile = billingProfileById(settings.billingProfile) ?? billingProfileById('exact')!;
  const wasteOf = new Map((input.wasteFactors ?? []).map((w) => [w.species.toLowerCase(), w.wasteFactor]));

  const lines: LineEstimate[] = input.items.map((m) => {
    const netBF = boardFootForQuantity({ thicknessIn: m.thicknessIn, widthIn: m.widthIn, lengthIn: m.lengthIn }, m.quantity);
    const wasteFactor = wasteOf.get(m.species.toLowerCase()) ?? settings.wasteFactor;
    const grossBF = purchaseBFWithWaste(netBF, wasteFactor);
    const pricePerBF = resolvePrice(input.priceList, m.species, m.thicknessIn);

    return {
      partId: m.partId,
      partName: m.partName,
      species: m.species,
      grade: m.grade,
      thicknessIn: m.thicknessIn,
      widthIn: m.widthIn,
      lengthIn: m.lengthIn,
      quantity: m.quantity,
      netBF,
      wasteFactor,
      grossBF,
      chargedBF: 0,
      pricePerBF,
      lineCost: 0,
      costWithMarkup: 0,
    };
  });

  // Billing: the profile rounds the per-piece tally (nominal thickness,
  // whole-foot lengths, piece rounding). The waste-inflated purchase quantity
  // is then billed at that per-piece rate — the yard bills the material you
  // actually buy, with its own rounding on top.
  const billingLines: BillingLineInput[] = lines.map((l) => ({
    thicknessIn: l.thicknessIn,
    widthIn: l.widthIn,
    lengthIn: l.lengthIn,
    quantity: 1,
  }));
  const billing = applyBillingProfile(billingLines, profile);

  lines.forEach((l, i) => {
    const rawPiece = billing.lines[i].rawPieceBF; // raw (profile-adjusted) BF per piece
    const piece = billing.lines[i].billedLineBF; // billed BF per piece after rounding (qty 1)
    const equivQty = rawPiece > 0 ? l.grossBF / rawPiece : 0; // purchase "pieces" equivalent
    switch (profile.rounding.scope) {
      case 'line':
        l.chargedBF = roundBF(l.grossBF, profile.rounding);
        break;
      case 'tally':
      case 'none':
        l.chargedBF = l.grossBF;
        break;
      case 'piece':
      default:
        // piece rounding applied per piece, then scaled to the purchase quantity
        l.chargedBF = piece * equivQty;
        break;
    }
    l.lineCost = l.chargedBF * l.pricePerBF;
    l.costWithMarkup = l.lineCost * (1 + settings.markupPct / 100);
  });

  let netBF = lines.reduce((s, l) => s + l.netBF, 0);
  let grossBF = lines.reduce((s, l) => s + l.grossBF, 0);
  let chargedBF = lines.reduce((s, l) => s + l.chargedBF, 0);
  // Tally rounding applies to the whole invoice once.
  if (profile.rounding.scope === 'tally') {
    chargedBF = roundBF(chargedBF, profile.rounding);
  }
  const costBeforeMarkup = lines.reduce((s, l) => s + l.lineCost, 0);
  const costWithMarkup = lines.reduce((s, l) => s + l.costWithMarkup, 0);

  const speciesMap = new Map<string, { species: string; thicknessIn: number; netBF: number; grossBF: number; cost: number }>();
  for (const l of lines) {
    const key = `${l.species}|${l.thicknessIn}`;
    const cur = speciesMap.get(key) ?? { species: l.species, thicknessIn: l.thicknessIn, netBF: 0, grossBF: 0, cost: 0 };
    cur.netBF += l.netBF;
    cur.grossBF += l.grossBF;
    cur.cost += l.lineCost;
    speciesMap.set(key, cur);
  }

  return {
    settings,
    profile,
    lines,
    speciesSummary: [...speciesMap.values()].sort((a, b) => b.grossBF - a.grossBF),
    totals: {
      netBF,
      grossBF,
      chargedBF,
      costBeforeMarkup,
      markupAmount: costWithMarkup - costBeforeMarkup,
      costWithMarkup,
      yieldPct: grossBF > 0 ? (netBF / grossBF) * 100 : 0,
      wasteBF: grossBF - netBF,
    },
  };
}

export function listBillingProfiles(): string[] {
  return BILLING_PROFILES.map((p) => p.id);
}
