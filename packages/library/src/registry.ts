import type { LibraryEntry, LibraryEntryMeta } from './catalog';
import { BASIC_ENTRIES } from './entries/basic';
import { INVENTORY_ENTRIES } from './entries/inventory';

export interface LibraryFamily {
  id: string;
  /** Spanish, user-facing. */
  name: string;
  description: string;
  /** The variants to choose from by function, in catalog order. */
  variants: LibraryEntryMeta[];
}

const ENTRIES: readonly LibraryEntry[] = [...BASIC_ENTRIES, ...INVENTORY_ENTRIES];

const FAMILY_INFO: Record<string, { name: string; description: string }> = {
  inventory: {
    name: 'Inventario',
    description: 'Variantes de inventario de juego: elige según la función que necesita tu diseño.',
  },
};

export const listEntries = (): LibraryEntry[] => [...ENTRIES];

export const getEntry = (id: string): LibraryEntry | undefined => ENTRIES.find((e) => e.id === id);

const toMeta = ({ params: _params, build: _build, ...meta }: LibraryEntry): LibraryEntryMeta => {
  void _params;
  void _build;
  return meta;
};

export function listFamilies(): LibraryFamily[] {
  const families = new Map<string, LibraryFamily>();
  for (const entry of ENTRIES) {
    if (!entry.family) continue;
    let family = families.get(entry.family);
    if (!family) {
      const info = FAMILY_INFO[entry.family];
      family = {
        id: entry.family,
        name: info?.name ?? entry.family,
        description: info?.description ?? '',
        variants: [],
      };
      families.set(entry.family, family);
    }
    family.variants.push(toMeta(entry));
  }
  return [...families.values()];
}
