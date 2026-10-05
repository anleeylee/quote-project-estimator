#!/usr/bin/env node
/**
 * cli.ts — bfc-estimate: Lumber Quote & Project Estimator CLI.
 *
 * Workflow:  init → import → estimate → quote → report
 * Try it instantly with:  bfc-estimate demo
 */

import { Command } from 'commander';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { formatInches } from './core';
import { newProject, loadProject, saveProject, MaterialItem, PriceEntry, ProjectSettings } from './features/project';
import { readMaterialsFile, readPriceListFile } from './features/materials';
import { estimate, EstimateResult, listBillingProfiles } from './features/estimate';
import { buildQuote, exportQuoteCSV, QuoteDocument } from './features/quote';
import { quoteHTML } from './features/report';
import { writeCSV } from './features/io';

const program = new Command();
program.name('bfc-estimate').description('Estimate lumber quotes from a cut list.').version('1.0.0');

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

program
  .command('init')
  .description('Create a new project document (optionally with a price list)')
  .requiredOption('--project <file>', 'project JSON path')
  .option('--name <name>', 'project name', 'Untitled project')
  .option('--customer <name>', 'customer')
  .option('--price-list <file>', 'price list CSV/XLSX to embed')
  .action((opts: { project: string; name: string; customer?: string; priceList?: string }) => {
    if (existsSync(opts.project)) {
      console.error(`Project already exists: ${opts.project}`);
      process.exitCode = 1;
      return;
    }
    const project = newProject(opts.name, opts.customer ?? '');
    if (opts.priceList) {
      const res = readPriceListFile(opts.priceList);
      for (const r of res.rejected) console.warn(`  Rejected price row ${r.row}: ${r.reason}`);
      project.priceList = res.items;
    }
    saveProject(opts.project, project);
    console.log(`Project written to ${opts.project} (${project.items.length} items, ${project.priceList.length} price entries)`);
  });

program
  .command('import')
  .description('Import material lines from CSV/XLSX into a project')
  .requiredOption('--materials <file>', 'material list file')
  .requiredOption('--project <file>', 'project JSON path')
  .option('--replace', 'replace existing items instead of appending')
  .action((opts: { materials: string; project: string; replace?: boolean }) => {
    const project = loadProject(opts.project);
    const res = readMaterialsFile(opts.materials);
    for (const w of res.warnings) console.warn(`Warning: ${w}`);
    for (const r of res.rejected) console.warn(`  Rejected row ${r.row}: ${r.reason}`);
    project.items = opts.replace ? res.items : [...project.items, ...res.items];
    saveProject(opts.project, project);
    console.log(`Project now has ${project.items.length} material line(s).`);
  });

program
  .command('estimate')
  .description('Run the estimate and print a summary')
  .requiredOption('--project <file>', 'project JSON path')
  .option('--waste <factor>', 'default waste factor (0.15 = 15%)')
  .option('--billing <profile>', `billing profile (${listBillingProfiles().join(' | ')})`, 'exact')
  .option('--markup <pct>', 'markup percent')
  .option('--json <file>', 'write estimate JSON')
  .option('--csv <file>', 'write estimate CSV')
  .action((opts: { project: string; waste?: string; billing: string; markup?: string; json?: string; csv?: string }) => {
    const project = loadProject(opts.project);
    if (opts.waste) project.settings.wasteFactor = Number(opts.waste);
    if (opts.billing) project.settings.billingProfile = opts.billing;
    if (opts.markup) project.settings.markupPct = Number(opts.markup);
    const result = estimate({ items: project.items, priceList: project.priceList, settings: project.settings });
    printEstimate(result);
    if (opts.json) writeFileSync(opts.json, JSON.stringify(result, null, 2), 'utf8');
    if (opts.csv) {
      writeCSV(opts.csv, [
        ['Part ID', 'Part Name', 'Species', 'Thickness', 'Width', 'Length', 'Qty', 'Net BF', 'Waste %', 'Gross BF', 'Charged BF', 'Price/BF', 'Line Cost'],
        ...result.lines.map((l) => [l.partId, l.partName, l.species, l.thicknessIn, l.widthIn, l.lengthIn, l.quantity, r2(l.netBF), Math.round(l.wasteFactor * 1000) / 10, r2(l.grossBF), r2(l.chargedBF), r2(l.pricePerBF), r2(l.lineCost)]),
      ]);
    }
  });

program
  .command('quote')
  .description('Build the final quote (totals with tax, delivery, fees, discount)')
  .requiredOption('--project <file>', 'project JSON path')
  .option('--customer <name>', 'customer')
  .option('--tax-rate <pct>', 'tax rate percent (e.g. 8.5)')
  .option('--tax-included', 'prices already include tax')
  .option('--delivery <amount>', 'delivery charge')
  .option('--fees <amount>', 'other fees')
  .option('--discount <amount>', 'discount')
  .option('--out <file>', 'write quote JSON')
  .action(
    (opts: { project: string; customer?: string; taxRate?: string; taxIncluded?: boolean; delivery?: string; fees?: string; discount?: string; out?: string }) => {
      const project = loadProject(opts.project);
      if (opts.customer) project.customer = opts.customer;
      if (opts.taxRate) project.settings.taxRate = Number(opts.taxRate) / 100;
      if (opts.taxIncluded) project.settings.taxIncluded = true;
      if (opts.delivery) project.settings.delivery = Number(opts.delivery);
      if (opts.fees) project.settings.fees = Number(opts.fees);
      if (opts.discount) project.settings.discount = Number(opts.discount);
      const result = estimate({ items: project.items, priceList: project.priceList, settings: project.settings });
      const quote = buildQuote(project, result);
      printQuote(quote);
      if (opts.out) {
        saveProject(opts.out, project);
        console.log(`Quote project saved to ${opts.out}`);
      }
    },
  );

program
  .command('scenario')
  .description('Compare the current project against an alternate price list')
  .requiredOption('--project <file>', 'project JSON path')
  .requiredOption('--price-list <file>', 'alternate price list CSV/XLSX')
  .option('--name <name>', 'scenario name', 'alternate')
  .action((opts: { project: string; priceList: string; name: string }) => {
    const project = loadProject(opts.project);
    const base = estimate({ items: project.items, priceList: project.priceList, settings: project.settings });
    const altPrices = readPriceListFile(opts.priceList);
    const alt = estimate({ items: project.items, priceList: altPrices.items, settings: project.settings });
    const diff = alt.totals.costWithMarkup - base.totals.costWithMarkup;
    console.log(`Scenario "${opts.name}" vs default price list:`);
    console.log(`  Default: ${base.totals.costWithMarkup.toFixed(2)} (${base.totals.chargedBF.toFixed(2)} charged BF)`);
    console.log(`  ${opts.name}: ${alt.totals.costWithMarkup.toFixed(2)} (${alt.totals.chargedBF.toFixed(2)} charged BF)`);
    console.log(`  Difference: ${diff >= 0 ? '+' : ''}${diff.toFixed(2)} (${((diff / base.totals.costWithMarkup) * 100).toFixed(1)}%)`);
  });

program
  .command('report')
  .description('Export the quote as HTML / CSV')
  .requiredOption('--project <file>', 'project JSON path')
  .option('--html <file>', 'HTML quote output')
  .option('--csv <file>', 'CSV quote output')
  .option('--json <file>', 'full quote JSON output')
  .action((opts: { project: string; html?: string; csv?: string; json?: string }) => {
    const project = loadProject(opts.project);
    const result = estimate({ items: project.items, priceList: project.priceList, settings: project.settings });
    const quote = buildQuote(project, result);
    if (opts.html) {
      writeFileSync(opts.html, quoteHTML(quote), 'utf8');
      console.log(`HTML quote written to ${opts.html}`);
    }
    if (opts.csv) {
      exportQuoteCSV(opts.csv, quote);
      console.log(`CSV quote written to ${opts.csv}`);
    }
    if (opts.json) {
      writeFileSync(opts.json, JSON.stringify(quote, null, 2), 'utf8');
      console.log(`JSON quote written to ${opts.json}`);
    }
  });

program
  .command('demo')
  .description('Create a demo project in ./demo and generate a full quote')
  .action(() => {
    const dir = join(process.cwd(), 'demo');
    mkdirSync(dir, { recursive: true });
    const projectPath = join(dir, 'project.json');
    const project = newProject('Demo Walnut Sideboard', 'Sample Customer');
    project.items = [
      { partId: 'T1', partName: 'Top', species: 'Black Walnut', grade: 'FAS', thicknessIn: 2, widthIn: 24, lengthIn: 48, quantity: 1, notes: '' },
      { partId: 'S1', partName: 'Side', species: 'Black Walnut', grade: 'FAS', thicknessIn: 2, widthIn: 18, lengthIn: 30, quantity: 2, notes: '' },
      { partId: 'D1', partName: 'Drawer Front', species: 'Hard Maple', grade: 'FAS', thicknessIn: 1, widthIn: 6, lengthIn: 14, quantity: 4, notes: '' },
      { partId: 'R1', partName: 'Rails', species: 'Red Oak', grade: 'FAS', thicknessIn: 1, widthIn: 3, lengthIn: 22, quantity: 6, notes: '' },
    ];
    project.priceList = [
      { species: 'Black Walnut', thicknessIn: 2, pricePerBF: 13.5 },
      { species: 'Black Walnut', thicknessIn: 1, pricePerBF: 12.0 },
      { species: 'Hard Maple', thicknessIn: 1, pricePerBF: 8.75 },
      { species: 'Red Oak', thicknessIn: 1, pricePerBF: 6.5 },
    ];
    project.settings = { ...project.settings, wasteFactor: 0.15, taxRate: 0.07, delivery: 45, fees: 20, discount: 0, markupPct: 40, billingProfile: 'tenth-bf-per-piece' };
    saveProject(projectPath, project);

    const result = estimate({ items: project.items, priceList: project.priceList, settings: project.settings });
    printEstimate(result);
    const quote = buildQuote(project, result, 'default');
    printQuote(quote);

    const htmlPath = join(dir, 'quote.html');
    writeFileSync(htmlPath, quoteHTML(quote), 'utf8');
    const csvPath = join(dir, 'quote.csv');
    exportQuoteCSV(csvPath, quote);
    const jsonPath = join(dir, 'quote.json');
    writeFileSync(jsonPath, JSON.stringify(quote, null, 2), 'utf8');
    console.log(`\nFiles written to ${dir}/`);
    console.log('  project.json, quote.html, quote.csv, quote.json');
  });

function printEstimate(result: EstimateResult): void {
  const t = result.totals;
  console.log(`Profile: ${result.profile.id} | waste ${Math.round(result.settings.wasteFactor * 100)}% | markup ${result.settings.markupPct}%`);
  console.log(`Net ${t.netBF.toFixed(2)} BF | Gross ${t.grossBF.toFixed(2)} BF | Charged ${t.chargedBF.toFixed(2)} BF | Yield ${t.yieldPct.toFixed(1)}%`);
  for (const l of result.lines) {
    console.log(
      `  ${l.partId.padEnd(4)} ${l.partName.padEnd(14)} ${l.species.padEnd(14)} ${formatInches(l.thicknessIn)}"×${formatInches(l.widthIn)}"×${formatInches(l.lengthIn)}" ×${l.quantity} | net ${l.netBF.toFixed(2)} → gross ${l.grossBF.toFixed(2)} | $${l.pricePerBF.toFixed(2)}/BF | $${l.lineCost.toFixed(2)}`,
    );
  }
  console.log(`Material cost: $${t.costBeforeMarkup.toFixed(2)} → with markup $${t.costWithMarkup.toFixed(2)}`);
}

function printQuote(quote: QuoteDocument): void {
  const t = quote.totals;
  console.log(`Quote: ${quote.project.name} (${quote.project.customer || 'no customer'})`);
  console.log(`  Subtotal: $${t.subtotal.toFixed(2)} | Tax: $${t.tax.toFixed(2)} | Delivery: $${t.delivery.toFixed(2)} | Fees: $${t.fees.toFixed(2)} | Discount: $${t.discount.toFixed(2)}`);
  console.log(`  TOTAL: $${t.total.toFixed(2)}`);
}

function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

program.parseAsync(process.argv).catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
