import { z } from 'zod';
import { FILTER_VALUE_PATTERN } from '../../bindings';
import { INVENTORY_ITEM_CATEGORIES } from '../../mock/items';
import { EQUIPMENT_SLOT_TYPES } from './equipment-part';

/** A category usable inside a `[field=value]` filter segment of a binding path. */
export const filterValue = z
  .string()
  .min(1)
  .regex(FILTER_VALUE_PATTERN, 'must not contain "[", "]" or "="');

const unique = (values: readonly string[]) => new Set(values).size === values.length;

export const categoriesParam = z
  .array(filterValue)
  .min(1)
  .max(8)
  .refine(unique, 'categories must be unique')
  .default([...INVENTORY_ITEM_CATEGORIES])
  .describe('Categorías (una pestaña por categoría)');

export const slotTypesParam = z
  .array(z.enum(EQUIPMENT_SLOT_TYPES))
  .min(1)
  .refine(unique, 'slot types must be unique')
  .default([...EQUIPMENT_SLOT_TYPES])
  .describe('Casillas de equipamiento');

/** Options shared by every variant that renders an item grid. */
export const gridParamsShape = {
  columns: z.number().int().min(1).max(12).default(5).describe('Columnas'),
  rows: z.number().int().min(1).max(12).default(4).describe('Filas'),
  slotSize: z.number().int().min(24).max(160).default(64).describe('Tamaño de casilla'),
  maxStack: z.number().int().positive().default(99).describe('Máximo por pila'),
  showCount: z.boolean().default(true).describe('Mostrar cantidad'),
};
