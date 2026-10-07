import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * Where the stock list comes from. This is the ONLY place that knows about the source.
 *
 * - Today: `content/inventory.json` (public snapshot).
 * - Later: set the `INVENTORY_CSV_URL` environment variable (e.g. a GitHub Actions variable) to the
 *   "Publish to web → CSV" link of a Google Sheet that contains ONLY public columns:
 *   id, brand, model, year, colour, transmission, cashPriceRM, loanPriceRM, photos, featured
 *   (photos = file names in src/assets/cars, separated by "|"; featured = TRUE/FALSE).
 *   Never point this at the internal stock sheet with costs — a published sheet is readable by anyone.
 *
 * Whatever comes back is treated as untrusted: `vehicles.ts` keeps only whitelisted public fields.
 */

export type RawRecord = Record<string, unknown>;

export interface RawInventory {
  snapshotAt: string | null;
  records: RawRecord[];
}

export async function loadRawInventory(): Promise<RawInventory> {
  const csvUrl = process.env.INVENTORY_CSV_URL?.trim();
  if (csvUrl) {
    const res = await fetch(csvUrl);
    if (!res.ok) throw new Error(`Could not download the stock sheet (HTTP ${res.status}).`);
    return { snapshotAt: new Date().toISOString(), records: parseCsv(await res.text()) };
  }

  const file = resolve(process.cwd(), 'content/inventory.json');
  const json = JSON.parse(await readFile(file, 'utf-8')) as { snapshotAt?: string; vehicles?: RawRecord[] };
  return { snapshotAt: json.snapshotAt ?? null, records: json.vehicles ?? [] };
}

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF). First row = headers. */
export function parseCsv(text: string): RawRecord[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows.filter((r) => r.some((cell) => cell.trim() !== ''));
  if (!header) return [];
  const keys = header.map((h) => h.trim());

  return body.map((cells) => {
    const record: RawRecord = {};
    keys.forEach((key, i) => {
      const value = (cells[i] ?? '').trim();
      if (key === 'photos') record.photos = value ? value.split('|').map((p) => p.trim()).filter(Boolean) : [];
      else if (key === 'featured') record.featured = /^(true|yes|1)$/i.test(value);
      else if (key === 'cashPriceRM' || key === 'loanPriceRM') {
        const n = Number(value.replace(/[^\d.]/g, ''));
        record[key] = value && Number.isFinite(n) && n > 0 ? n : null;
      } else record[key] = value;
    });
    return record;
  });
}
