import type { ImageMetadata } from 'astro';
import { baseSlug, detectTransmission, normaliseColour, parseYear, slugify, splitName } from './normalise.js';
import { loadRawInventory, type RawRecord } from './source';
import { ASK_OUR_TEAM } from '../lib/format';

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
  /** English colour, e.g. "Grey". Empty when the stock list has no colour. */
  colour: string;
  /** Title plus colour, e.g. "2024 HONDA CIVIC 1.5 AT RS (Grey)". */
  label: string;
  /** "Automatic", "Manual" or "Ask our team". */
  transmission: string;
  cashPriceRM: number | null;
  loanPriceRM: number | null;
  photos: ImageMetadata[];
  /** Photo paths inside src/assets/cars (for build-time Open Graph images). */
  photoFiles: string[];
  featured: boolean;
  /** Lower = shown first in the default ("recommended") order. */
  rank: number;
}

// Photos live in src/assets/cars so Astro can resize and convert them (AVIF/WebP):
// the original 23 photos at the top level, photos synced from Google Drive in live/ (see scripts/sync-stock.mjs).
const photoModules = import.meta.glob<{ default: ImageMetadata }>('../assets/cars/**/*.{jpeg,jpg,png,webp}', {
  eager: true,
});
const photosByPath = new Map(
  Object.entries(photoModules).map(([path, mod]) => [path.replace('../assets/cars/', '').toLowerCase(), mod.default]),
);
/** "/cars/car-1.jpeg" → "car-1.jpeg", "/cars/live/p-2.jpg" → "live/p-2.jpg". */
const photoPath = (value: string) => value.trim().replace(/^\/?cars\//, '').toLowerCase();

/**
 * True for a landscape photo. Reads the size from Astro's private copy of the image data: touching the
 * photo object itself would make Astro ship the full-size original file with the site.
 */
export function isLandscape(photo: ImageMetadata): boolean {
  const plain = (photo as ImageMetadata & { clone?: ImageMetadata }).clone ?? photo;
  return plain.width > plain.height;
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

    const { brand, model } = splitName(`${str(r.brand)} ${str(r.model)}`);
    if (!model) continue;
    const { year, regYear } = parseYear(str(r.year));
    if (!Number.isFinite(year)) continue;
    const colour = normaliseColour(str(r.colour));
    const name = `${brand} ${model}`;
    const title = `${year} ${name}`;

    const base = baseSlug({ brand, model, year, colour });
    let slug = base;
    for (let n = 2; usedSlugs.has(slug); n++) slug = `${base}-${n}`;
    usedSlugs.add(slug);

    const photoFiles = (Array.isArray(r.photos) ? r.photos : [])
      .map((p) => photoPath(str(p)))
      .filter((file) => photosByPath.has(file));

    vehicles.push({
      id: str(r.id) || slug,
      slug,
      brand,
      brandKey: slugify(brand),
      model,
      name,
      title,
      year,
      regYear,
      yearLabel: regYear ? `${year} · Reg. ${regYear}` : String(year),
      colour,
      label: colour ? `${title} (${colour})` : title,
      transmission: str(r.transmission).trim() || detectTransmission(model) || ASK_OUR_TEAM,
      cashPriceRM: price(r.cashPriceRM),
      loanPriceRM: price(r.loanPriceRM),
      photos: photoFiles.map((file) => photosByPath.get(file)!),
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
