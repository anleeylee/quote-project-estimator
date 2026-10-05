/**
 * report.ts — HTML quote document (shareable with customers).
 */

import { formatInches, ENGINE_DISCLAIMER } from '../core';
import { QuoteDocument } from './quote';
import { formatCurrency } from './quote';

export function quoteHTML(quote: QuoteDocument): string {
  const t = quote.totals;
  const project = quote.project;
  const settings = project.settings;

  const lineRows = quote.estimate.lines
    .map(
      (l) => `<tr>
      <td>${esc(l.partId)}</td>
      <td>${esc(l.partName)}</td>
      <td>${esc(l.species)}${l.grade ? ' <span class="muted">' + esc(l.grade) + '</span>' : ''}</td>
      <td>${formatInches(l.thicknessIn)}"</td>
      <td>${formatInches(l.widthIn)}"</td>
      <td>${formatInches(l.lengthIn)}"</td>
      <td>${l.quantity}</td>
      <td class="num">${fmt(l.netBF)}</td>
      <td class="num">${Math.round(l.wasteFactor * 1000) / 10}%</td>
      <td class="num">${fmt(l.grossBF)}</td>
      <td class="num">${fmt(l.chargedBF)}</td>
      <td class="num">${formatCurrency(l.pricePerBF)}</td>
      <td class="num">${formatCurrency(l.lineCost)}</td>
    </tr>`,
    )
    .join('\n');

  const speciesRows = quote.estimate.speciesSummary
    .map(
      (s) => `<tr>
      <td>${esc(s.species)}</td>
      <td class="num">${formatInches(s.thicknessIn)}"</td>
      <td class="num">${fmt(s.netBF)}</td>
      <td class="num">${fmt(s.grossBF)}</td>
      <td class="num">${formatCurrency(s.cost)}</td>
    </tr>`,
    )
    .join('\n');

  const profile = quote.estimate.profile;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(project.name)} — Lumber Quote</title>
<style>
  body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;margin:0;background:#f5f4f0;color:#222}
  .sheet{max-width:920px;margin:24px auto;background:#fff;padding:32px 40px;border-radius:10px;box-shadow:0 1px 8px rgba(0,0,0,.08)}
  h1{margin:0 0 4px;font-size:24px}
  h2{font-size:15px;margin:28px 0 8px;border-bottom:2px solid #e8e2d5;padding-bottom:4px}
  .muted{color:#777;font-size:12px}
  .meta{color:#555;font-size:13px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{background:#f1ecdf;text-align:left;padding:6px 8px;font-weight:600}
  td{padding:6px 8px;border-bottom:1px solid #eee}
  .num{text-align:right;font-variant-numeric:tabular-nums}
  .totals td{font-size:14px}
  .grand{font-weight:700;font-size:16px;background:#faf7ee}
  .foot{margin-top:26px;font-size:11px;color:#888;border-top:1px solid #e5e5e5;padding-top:10px}
  .badge{display:inline-block;background:#2c6e49;color:#fff;border-radius:999px;padding:2px 10px;font-size:12px}
</style>
</head>
<body>
<div class="sheet">
  <h1>${esc(project.name)}</h1>
  <p class="meta">Customer: ${esc(project.customer || '—')} &nbsp;|&nbsp; Generated: ${esc(quote.generatedAt)} &nbsp;|&nbsp; Scenario: ${esc(quote.scenarioName ?? 'default')}</p>

  <h2>Material Estimate <span class="badge">${esc(profile.id)} billing</span></h2>
  <table>
    <thead><tr>
      <th>Part</th><th>Description</th><th>Species</th><th>T</th><th>W</th><th>L</th><th>Qty</th>
      <th class="num">Net BF</th><th class="num">Waste</th><th class="num">Gross</th><th class="num">Charged</th>
      <th class="num">$/BF</th><th class="num">Line</th>
    </tr></thead>
    <tbody>${lineRows}</tbody>
  </table>

  <h2>Species Summary (material planning)</h2>
  <table>
    <thead><tr><th>Species</th><th class="num">Thickness</th><th class="num">Net BF</th><th class="num">Gross BF</th><th class="num">Cost</th></tr></thead>
    <tbody>${speciesRows}</tbody>
  </table>

  <h2>Totals</h2>
  <table class="totals">
    <tr><td>Material subtotal (gross BF, with markup)</td><td class="num">${formatCurrency(t.subtotal)}</td></tr>
    ${t.markupAmount ? `<tr><td class="muted">Cost before markup</td><td class="num">${formatCurrency(t.cost)}</td></tr>` : ''}
    <tr><td>Tax${t.taxIncluded ? ' (included in prices)' : ''}</td><td class="num">${formatCurrency(t.tax)}</td></tr>
    ${t.delivery ? `<tr><td>Delivery</td><td class="num">${formatCurrency(t.delivery)}</td></tr>` : ''}
    ${t.fees ? `<tr><td>Fees</td><td class="num">${formatCurrency(t.fees)}</td></tr>` : ''}
    ${t.discount ? `<tr><td>Discount</td><td class="num">−${formatCurrency(t.discount)}</td></tr>` : ''}
    <tr class="grand"><td>Total</td><td class="num">${formatCurrency(t.total)}</td></tr>
  </table>

  <p class="foot">Settings — waste factor ${Math.round(settings.wasteFactor * 100)}%, tax rate ${(settings.taxRate * 100).toFixed(2)}%, markup ${settings.markupPct}%. ${esc(ENGINE_DISCLAIMER)}</p>
</div>
</body>
</html>`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function fmt(v: number): string {
  return v.toFixed(2);
}
