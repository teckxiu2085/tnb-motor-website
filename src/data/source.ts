import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * Where the stock list comes from. This is the ONLY place that knows about the source.
 *
 * `content/inventory.json` is the public snapshot. Once the stock sync is set up, it is written by
 * `scripts/sync-stock.mjs` (GitHub Actions, every hour) from 修哥's Google Sheet, through a private
 * Apps Script that sends public fields only. The build itself never talks to Google.
 *
 * Whatever is in the file is treated as untrusted: `vehicles.ts` keeps only whitelisted public fields.
 */

export type RawRecord = Record<string, unknown>;

export interface RawInventory {
  snapshotAt: string | null;
  records: RawRecord[];
}

export async function loadRawInventory(): Promise<RawInventory> {
  const file = resolve(process.cwd(), 'content/inventory.json');
  const json = JSON.parse(await readFile(file, 'utf-8')) as { snapshotAt?: string; vehicles?: RawRecord[] };
  return { snapshotAt: json.snapshotAt ?? null, records: json.vehicles ?? [] };
}
