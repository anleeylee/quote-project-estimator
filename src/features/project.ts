/**
 * project.ts — Project & quote document container.
 *
 * A project is a single JSON document that holds the material list, the
 * species price list and the quote settings (tax, delivery, fees, discount,
 * markup, billing profile). The estimator reads this document, never
 * duplicates it, and can emit it back out as a filled quote.
 */

import { z } from 'zod';
import { friendlyZodError } from '../core';
import { readJSON, writeJSON } from './io';

export const MaterialItemSchema = z.object({
  partId: z.string().min(1, 'Part ID required'),
  partName: z.string().default(''),
  species: z.string().min(1, 'Species required'),
  grade: z.string().default(''),
  thicknessIn: z.number().positive(),
  widthIn: z.number().positive(),
  lengthIn: z.number().positive(),
  quantity: z.number().int().positive().default(1),
  notes: z.string().default(''),
});

export type MaterialItem = z.infer<typeof MaterialItemSchema>;

export const PriceEntrySchema = z.object({
  species: z.string().min(1),
  thicknessIn: z.number().positive().default(1),
  pricePerBF: z.number().nonnegative(),
});

export type PriceEntry = z.infer<typeof PriceEntrySchema>;

export const ProjectSettingsSchema = z.object({
  wasteFactor: z.number().min(0).max(1).default(0.15),
  taxRate: z.number().min(0).max(1).default(0),
  taxIncluded: z.boolean().default(false),
  delivery: z.number().min(0).default(0),
  fees: z.number().min(0).default(0),
  discount: z.number().min(0).default(0),
  markupPct: z.number().min(0).default(0),
  billingProfile: z.string().default('exact'),
});

export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;

export const ProjectSchema = z.object({
  version: z.string().default('1.0.0'),
  name: z.string().default('Untitled project'),
  customer: z.string().default(''),
  items: z.array(MaterialItemSchema).default([]),
  priceList: z.array(PriceEntrySchema).default([]),
  settings: ProjectSettingsSchema.default({}),
});

export type ProjectDoc = z.infer<typeof ProjectSchema>;

export const DEFAULT_SETTINGS: ProjectSettings = {
  wasteFactor: 0.15,
  taxRate: 0,
  taxIncluded: false,
  delivery: 0,
  fees: 0,
  discount: 0,
  markupPct: 0,
  billingProfile: 'exact',
};

export function newProject(name = 'Untitled project', customer = ''): ProjectDoc {
  return { version: '1.0.0', name, customer, items: [], priceList: [], settings: { ...DEFAULT_SETTINGS } };
}

export function parseProject(raw: unknown): ProjectDoc {
  const parsed = ProjectSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid project document: ${friendlyZodError(parsed.error)}`);
  }
  return parsed.data;
}

export function loadProject(path: string): ProjectDoc {
  return parseProject(readJSON(path));
}

export function saveProject(path: string, project: ProjectDoc): void {
  writeJSON(path, project);
}
