/**
 * materials.ts — Import material lists (cut lists) and price lists into a project.
 */

import {
  mapHeaders,
  parseDecimal,
  parseDimension,
  parseThickness,
  cell,
} from '../core';
import { readTableFile } from './io';
import { MaterialItem, PriceEntry } from './project';

const MATERIAL_SYNONYMS: Record<string, string[]> = {
  partId: ['partid', 'part id', 'id', 'part', 'item'],
  partName: ['partname', 'part name', 'name', 'description'],
  species: ['species', 'wood', 'material'],
  grade: ['grade', 'select', 'fas'],
  thicknessIn: ['thickness', 'thk', 't'],
  widthIn: ['width', 'wdth', 'w'],
  lengthIn: ['length', 'len', 'l'],
  quantity: ['quantity', 'qty', 'q', 'pieces', 'pcs', 'count'],
  notes: ['notes', 'note', 'comment'],
};

const PRICE_SYNONYMS: Record<string, string[]> = {
  species: ['species', 'wood', 'material'],
  thicknessIn: ['thickness', 'thk', 't'],
  pricePerBF: ['price/bf', 'price per bf', '$/bf', 'price', 'bf price', 'per bf'],
};

export interface ImportResult<T> {
  items: T[];
  rejected: { row: number; reason: string }[];
  warnings: string[];
}

export function importMaterials(rows: string[][]): ImportResult<MaterialItem> {
  if (rows.length < 2) return { items: [], rejected: [{ row: 1, reason: 'No data rows' }], warnings: [] };
  const headers = rows[0];
  const { mapping, unmapped } = mapHeaders(headers, MATERIAL_SYNONYMS);
  const warnings = unmapped
    .filter((f) => !['partName', 'grade', 'quantity', 'notes'].includes(f))
    .map((f) => `Column not found: "${f}"`);

  const items: MaterialItem[] = [];
  const rejected: ImportResult<MaterialItem>['rejected'] = [];
  rows.slice(1).forEach((raw, idx) => {
    const rowIndex = idx + 2;
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = raw[i] ?? '';
    });
    const partId = cell(row, mapping, 'partId');
    if (!partId) {
      rejected.push({ row: rowIndex, reason: 'Missing Part ID' });
      return;
    }
    try {
      items.push({
        partId,
        partName: cell(row, mapping, 'partName'),
        species: cell(row, mapping, 'species'),
        grade: cell(row, mapping, 'grade'),
        thicknessIn: parseThickness(cell(row, mapping, 'thicknessIn')).thicknessIn,
        widthIn: parseDimension(cell(row, mapping, 'widthIn')).inches,
        lengthIn: parseDimension(cell(row, mapping, 'lengthIn')).inches,
        quantity: parseDecimal(cell(row, mapping, 'quantity')) ?? 1,
        notes: cell(row, mapping, 'notes'),
      });
    } catch (err) {
      rejected.push({ row: rowIndex, reason: `${partId}: ${(err as Error).message}` });
    }
  });
  return { items, rejected, warnings };
}

export function importPriceList(rows: string[][]): ImportResult<PriceEntry> {
  if (rows.length < 2) return { items: [], rejected: [{ row: 1, reason: 'No data rows' }], warnings: [] };
  const headers = rows[0];
  const { mapping, unmapped } = mapHeaders(headers, PRICE_SYNONYMS);
  const warnings = unmapped.map((f) => `Price list column not found: "${f}"`);

  const items: PriceEntry[] = [];
  const rejected: ImportResult<PriceEntry>['rejected'] = [];
  rows.slice(1).forEach((raw, idx) => {
    const rowIndex = idx + 2;
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = raw[i] ?? '';
    });
    const species = cell(row, mapping, 'species');
    if (!species) {
      rejected.push({ row: rowIndex, reason: 'Missing species' });
      return;
    }
    try {
      items.push({
        species,
        thicknessIn: parseThickness(cell(row, mapping, 'thicknessIn')).thicknessIn,
        pricePerBF: Number(cell(row, mapping, 'pricePerBF')),
      });
    } catch (err) {
      rejected.push({ row: rowIndex, reason: `${species}: ${(err as Error).message}` });
    }
  });
  return { items, rejected, warnings };
}

export function readMaterialsFile(path: string): ImportResult<MaterialItem> {
  return importMaterials(readTableFile(path));
}

export function readPriceListFile(path: string): ImportResult<PriceEntry> {
  return importPriceList(readTableFile(path));
}
