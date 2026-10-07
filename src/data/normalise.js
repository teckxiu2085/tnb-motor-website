// Turns stock-sheet text into the brand, colour, year and page address shown on the website.
// Shared by the website build (src/data/vehicles.ts) and the stock sync (scripts/sync-stock.mjs),
// so both always produce the same result. Plain JavaScript so Node can run it without a build step.

/** Malay → English, plus a few typos seen in the stock sheet. Original data is never changed. */
const COLOUR_WORDS = {
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
  siver: 'Silver',
  sliver: 'Silver',
  mate: 'Matte',
};

/** Brands written as two words in the sheet. */
const TWO_WORD_BRANDS = {
  'MERCEDES BENZ': 'MERCEDES-BENZ',
  'LAND ROVER': 'LAND ROVER',
  'ALFA ROMEO': 'ALFA ROMEO',
  'ASTON MARTIN': 'ASTON MARTIN',
  'ROLLS ROYCE': 'ROLLS-ROYCE',
};

/**
 * "Kelabu" → "Grey", "WHite" → "White", "SilverBlue" → "Silver Blue". Empty stays empty.
 * @param {unknown} value
 * @returns {string}
 */
export function normaliseColour(value) {
  return String(value ?? '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => COLOUR_WORDS[word.toLowerCase()] ?? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * "2020" → 2020; "18/22" → made 2018, registered 2022 (recond).
 * @param {unknown} value
 * @returns {{ year: number, regYear: number | null }}
 */
export function parseYear(value) {
  const toFull = (/** @type {string} */ part) => {
    const n = Number(part);
    if (part.length === 4) return n;
    const thisYear = new Date().getFullYear() % 100;
    return n <= thisYear + 1 ? 2000 + n : 1900 + n;
  };
  const [made, reg] = String(value ?? '')
    .split('/')
    .map((p) => p.trim());
  const year = toFull(made);
  const regYear = reg ? toFull(reg) : null;
  return { year, regYear: regYear && regYear !== year ? regYear : null };
}

/**
 * "HONDA CIVIC 1.5 AT RS" → HONDA + "CIVIC 1.5 AT RS"; "MERCEDES BENZ C180 1.6 AT" → MERCEDES-BENZ + "C180 1.6 AT".
 * A leading "NEW" is dropped so the brand is found.
 * @param {unknown} text
 * @returns {{ brand: string, model: string }}
 */
export function splitName(text) {
  let words = String(text ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length > 2 && words[0].toUpperCase() === 'NEW') words = words.slice(1);
  const two = words.slice(0, 2).join(' ').toUpperCase();
  if (TWO_WORD_BRANDS[two] && words.length > 2) return { brand: TWO_WORD_BRANDS[two], model: words.slice(2).join(' ') };
  return { brand: (words[0] ?? '').toUpperCase(), model: words.slice(1).join(' ') };
}

/**
 * Transmission only when the model text says so ("1.5 AT", "1.3AT", "CVT", "MT"); otherwise null.
 * @param {unknown} model
 * @returns {'Automatic' | 'Manual' | null}
 */
export function detectTransmission(model) {
  const text = String(model ?? '').toUpperCase();
  if (/(?:\b|(?<=\d))(?:AT|CVT|DCT)\b/.test(text)) return 'Automatic';
  if (/(?:\b|(?<=\d))MT\b/.test(text)) return 'Manual';
  return null;
}

/**
 * @param {string} text
 * @returns {string}
 */
export function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Page address of a car (before "-2" is added for identical cars), e.g. "honda-civic-1-5-at-rs-2024-grey".
 * @param {{ brand: string, model: string, year: number, colour: string }} car
 * @returns {string}
 */
export function baseSlug({ brand, model, year, colour }) {
  return slugify([brand, model, year, colour].filter(Boolean).join(' '));
}
