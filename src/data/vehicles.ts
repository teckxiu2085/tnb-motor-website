import type { ImageMetadata } from 'astro';
import { loadRawInventory, type RawRecord } from './source';

/** Public fields only. Anything else in the source (costs, notes, owners…) is dropped here. */
const PUBLIC_FIELDS = [
  'id',
  'brand',
  'model',
  'year',
  'colour',
  'transmission',
  'cashPriceRM',
  'loanPriceRM',
  'photos',
  'featured',
] as const;

export interface Vehicle {
  id: string;
  slug: string;
  /** Display brand, e.g. "HONDA", "MERCEDES-BENZ". */
  brand: string;
  /** URL-safe brand key used by filters, e.g. "mercedes-benz". */
  brandKey: string;
  /** Model as listed, e.g. "CIVIC 1.5 AT RS". */
  model: string;
  /** Brand + model, e.g. "HONDA CIVIC 1.5 AT RS". */
  name: string;
  /** Year + brand + model, e.g. "2024 HONDA CIVIC 1.5 AT RS". */
  title: string;
  /** Year of manufacture. */
  year: number;
  /** Year of registration when it differs (recond imports, e.g. "18/22"). */
  regYear: number | null;
  /** e.g. "2024" or "2018 · Reg. 2022" */
  yearLabel: string;
  /** English colour, e.g. "Grey". */
  colour: string;
  transmission: string;
  cashPriceRM: number | null;
  loanPriceRM: number | null;
  photos: ImageMetadata[];
  /** Original photo file names (for build-time Open Graph images). */
  photoFiles: string[];
  featured: boolean;
  /** Lower = shown first in the default ("recommended") order. */
  rank: number;
}

// Photos live in src/assets/cars so Astro can resize and convert them (AVIF/WebP).
const photoModules = import.meta.glob<{ default: ImageMetadata }>('../assets/cars/*.{jpeg,jpg,png,webp}', {
  eager: true,
});
const photosByFile = new Map(
  Object.entries(photoModules).map(([path, mod]) => [path.split('/').pop()!.toLowerCase(), mod.default]),
);

// Malay → English, plus case clean-up ("WHite" → "White"). Original data is never changed.
const COLOUR_WORDS: Record<string, string> = {
  kelabu: 'Grey',
  putih: 'White',
  hitam: 'Black',
  merah: 'Red',
  biru: 'Blue',
  perak: 'Silver',
  ungu: 'Purple',
  hijau: 'Green',
  kuning: 'Yellow',
  coklat: 'Brown',
  oren: 'Orange',
  jingga: 'Orange',
  emas: 'Gold',
  gray: 'Grey',
};

function normaliseColour(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((word) => COLOUR_WORDS[word.toLowerCase()] ?? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function parseYear(value: string): { year: number; regYear: number | null } {
  const toFull = (part: string) => {
    const n = Number(part);
    if (part.length === 4) return n;
    const thisYear = new Date().getFullYear() % 100;
    return n <= thisYear + 1 ? 2000 + n : 1900 + n;
  };
  const [made, reg] = value.split('/').map((p) => p.trim());
  const year = toFull(made);
  const regYear = reg ? toFull(reg) : null;
  return { year, regYear: regYear && regYear !== year ? regYear : null };
}

/** "MERCEDES" + "BENZ C180 1.6 AT" → brand "MERCEDES-BENZ", model "C180 1.6 AT". */
function splitBrand(brand: string, model: string): { brand: string; model: string } {
  const b = brand.trim().toUpperCase();
  const m = model.trim();
  if (b === 'MERCEDES' && /^BENZ\s+/i.test(m)) return { brand: 'MERCEDES-BENZ', model: m.replace(/^BENZ\s+/i, '') };
  return { brand: b, model: m };
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const price = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

function pickPublic(record: RawRecord): Record<(typeof PUBLIC_FIELDS)[number], unknown> {
  return Object.fromEntries(PUBLIC_FIELDS.map((key) => [key, record[key]])) as Record<
    (typeof PUBLIC_FIELDS)[number],
    unknown
  >;
}

async function build() {
  const { snapshotAt, records } = await loadRawInventory();
  const usedSlugs = new Set<string>();
  const vehicles: Vehicle[] = [];

  for (const record of records) {
    const r = pickPublic(record);
    if (!str(r.brand).trim() || !str(r.model).trim() || !str(r.year).trim()) continue;

    const { brand, model } = splitBrand(str(r.brand), str(r.model));
    const { year, regYear } = parseYear(str(r.year));
    const colour = normaliseColour(str(r.colour));
    const name = `${brand} ${model}`;

    let slug = slugify(`${name} ${year} ${colour}`);
    for (let n = 2; usedSlugs.has(slug); n++) slug = `${slugify(`${name} ${year} ${colour}`)}-${n}`;
    usedSlugs.add(slug);

    const photoFiles = (Array.isArray(r.photos) ? r.photos : [])
      .map((p) => str(p).split('/').pop()!.toLowerCase())
      .filter((file) => photosByFile.has(file));

    vehicles.push({
      id: str(r.id) || slug,
      slug,
      brand,
      brandKey: slugify(brand),
      model,
      name,
      title: `${year} ${name}`,
      year,
      regYear,
      yearLabel: regYear ? `${year} · Reg. ${regYear}` : String(year),
      colour,
      transmission: str(r.transmission).trim() || 'Ask our team',
      cashPriceRM: price(r.cashPriceRM),
      loanPriceRM: price(r.loanPriceRM),
      photos: photoFiles.map((file) => photosByFile.get(file)!),
      photoFiles,
      featured: r.featured === true,
      rank: 0,
    });
  }

  // Recommended order: featured, then cars with both photo and price, then either, then the rest; newer first.
  const score = (v: Vehicle) =>
    (v.featured ? 4 : 0) + (v.photos.length ? 2 : 0) + (v.cashPriceRM !== null || v.loanPriceRM !== null ? 1 : 0);
  vehicles.sort((a, b) => score(b) - score(a) || b.year - a.year || a.name.localeCompare(b.name));
  vehicles.forEach((v, i) => (v.rank = i));

  return { snapshotAt, vehicles };
}

let cache: ReturnType<typeof build> | undefined;
const load = () => (cache ??= build());

export async function getVehicles(): Promise<Vehicle[]> {
  return (await load()).vehicles;
}

export async function getSnapshotDate(): Promise<string | null> {
  return (await load()).snapshotAt;
}

export async function getBrands(): Promise<{ key: string; label: string; count: number }[]> {
  const counts = new Map<string, { key: string; label: string; count: number }>();
  for (const v of await getVehicles()) {
    const entry = counts.get(v.brandKey) ?? { key: v.brandKey, label: v.brand, count: 0 };
    entry.count++;
    counts.set(v.brandKey, entry);
  }
  return [...counts.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Same brand first, then a similar price, then other cars with photos. */
export function relatedTo(car: Vehicle, all: Vehicle[], limit = 4): Vehicle[] {
  const priceOf = (v: Vehicle) => v.cashPriceRM ?? v.loanPriceRM;
  const p = priceOf(car);
  const others = all.filter((v) => v.id !== car.id);
  const sameBrand = others.filter((v) => v.brandKey === car.brandKey);
  const similarPrice =
    p === null
      ? []
      : others
          .filter((v) => priceOf(v) !== null && Math.abs(priceOf(v)! - p) / p <= 0.25)
          .sort((a, b) => Math.abs(priceOf(a)! - p) - Math.abs(priceOf(b)! - p));
  const picked: Vehicle[] = [];
  for (const v of [...sameBrand, ...similarPrice, ...others.filter((o) => o.photos.length)]) {
    if (!picked.includes(v)) picked.push(v);
    if (picked.length === limit) break;
  }
  return picked;
}
