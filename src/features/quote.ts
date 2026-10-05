/**
 * quote.ts — Quote document generation: totals, price scenarios, exports.
 *
 * A quote is an estimate plus commercial fields: customer, tax, delivery,
 * fees, discount. `invoiceTotals` from the shared engine guarantees the same
 * tax-included semantics everywhere else in the suite.
 */

import { invoiceTotals, formatMoney } from '../core';
import { EstimateResult } from './estimate';
import { ProjectDoc, ProjectSettings } from './project';
import { writeCSV } from './io';

export interface QuoteTotals {
  subtotal: number;
  markupAmount: number;
  cost: number;
  tax: number;
  delivery: number;
  discount: number;
  fees: number;
  total: number;
  taxIncluded: boolean;
}

export function quoteTotals(estimate: EstimateResult, settings: ProjectSettings): QuoteTotals {
  const totals = invoiceTotals({
    subtotal: estimate.totals.costWithMarkup,
    taxRate: settings.taxRate,
    taxIncluded: settings.taxIncluded,
    delivery: settings.delivery,
    discount: settings.discount,
    otherFees: settings.fees,
  });
  return {
    subtotal: estimate.totals.costWithMarkup,
    markupAmount: estimate.totals.markupAmount,
    cost: estimate.totals.costBeforeMarkup,
    tax: totals.tax,
    delivery: totals.delivery,
    discount: totals.discount,
    fees: totals.otherFees,
    total: totals.total,
    taxIncluded: settings.taxIncluded,
  };
}

export interface QuoteDocument {
  project: ProjectDoc;
  estimate: EstimateResult;
  totals: QuoteTotals;
  generatedAt: string;
  scenarioName?: string;
}

export function buildQuote(project: ProjectDoc, estimate: EstimateResult, scenarioName?: string): QuoteDocument {
  return {
    project,
    estimate,
    totals: quoteTotals(estimate, project.settings),
    generatedAt: new Date().toISOString(),
    scenarioName,
  };
}

export function quoteLineCSVRows(quote: QuoteDocument): (string | number)[][] {
  const head = ['Part ID', 'Part Name', 'Species', 'Grade', 'Thickness', 'Width', 'Length', 'Qty', 'Net BF', 'Waste %', 'Gross BF', 'Charged BF', 'Price/BF', 'Line Cost', 'With Markup'];
  const rows: (string | number)[][] = [head];
  for (const l of quote.estimate.lines) {
    rows.push([
      l.partId,
      l.partName,
      l.species,
      l.grade,
      l.thicknessIn,
      l.widthIn,
      l.lengthIn,
      l.quantity,
      r2(l.netBF),
      Math.round(l.wasteFactor * 1000) / 10,
      r2(l.grossBF),
      r2(l.chargedBF),
      r2(l.pricePerBF),
      r2(l.lineCost),
      r2(l.costWithMarkup),
    ]);
  }
  return rows;
}

export function quoteTotalsCSVRows(quote: QuoteDocument): (string | number)[][] {
  const t = quote.totals;
  return [
    ['Description', 'Amount'],
    ['Subtotal (with markup)', r2(t.subtotal)],
    ['Tax', r2(t.tax)],
    ['Delivery', r2(t.delivery)],
    ['Fees', r2(t.fees)],
    ['Discount', r2(t.discount)],
    ['TOTAL', r2(t.total)],
  ];
}

export function exportQuoteCSV(path: string, quote: QuoteDocument): void {
  const head: (string | number)[][] = [
    ['Quote', quote.project.name, quote.project.customer],
    ['Generated', quote.generatedAt, `Scenario: ${quote.scenarioName ?? 'default'}`],
    [],
  ];
  const lines = quoteLineCSVRows(quote);
  const totals = quoteTotalsCSVRows(quote);
  const rows = [...head, ...lines, [], ...totals];
  writeCSV(path, rows);
}

export function formatCurrency(value: number): string {
  return formatMoney(value);
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}
