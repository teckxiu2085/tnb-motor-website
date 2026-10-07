// Post-build checks for the static site in dist/. Run: node scripts/check-dist.mjs (CI runs it after the build).
// - every internal link / image points inside the base path and to a file that exists
// - no "TODO" text leaks into the pages
// - every car page has a WhatsApp button that mentions that car's page URL
// - the stock snapshot (content/inventory.json) holds public fields only
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const DIST = 'dist';
const BASE = '/tnb-motor-website/';
const SITE = 'https://teckxiu2085.github.io';

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

async function exists(path) {
  try {
    const s = await stat(path);
    if (s.isDirectory()) return exists(join(path, 'index.html'));
    return true;
  } catch {
    return false;
  }
}

const problems = [];
const files = (await walk(DIST)).filter((f) => f.endsWith('.html'));

for (const file of files) {
  const html = await readFile(file, 'utf-8');
  const page = '/' + relative(DIST, file);

  if (/\bTODO\b/.test(html.replace(/<script[\s\S]*?<\/script>/g, ''))) problems.push(`${page}: contains "TODO"`);

  const refs = new Set();
  for (const m of html.matchAll(/\s(?:href|src)="([^"]+)"/g)) refs.add(m[1]);
  for (const m of html.matchAll(/\ssrcset="([^"]+)"/g)) for (const part of m[1].split(',')) refs.add(part.trim().split(/\s+/)[0]);

  for (let ref of refs) {
    ref = ref.replaceAll('&amp;', '&');
    if (ref.startsWith(SITE)) ref = ref.slice(SITE.length);
    if (!ref.startsWith('/') || ref.startsWith('//')) continue;
    const path = decodeURIComponent(ref.split(/[?#]/)[0]);
    if (!path.startsWith(BASE)) {
      problems.push(`${page}: link outside base path → ${ref}`);
      continue;
    }
    if (!(await exists(join(DIST, path.slice(BASE.length))))) problems.push(`${page}: broken link → ${ref}`);
  }

  const car = page.match(/^\/cars\/([^/]+)\/index\.html$/);
  if (car) {
    const pageUrl = `${SITE}${BASE}cars/${car[1]}/`;
    const wa = [...html.matchAll(/href="(https:\/\/wa\.me\/[^"]+)"/g)].map((m) => decodeURIComponent(m[1].replaceAll('&amp;', '&')));
    if (!wa.some((link) => link.includes(pageUrl))) problems.push(`${page}: no WhatsApp link mentioning ${pageUrl}`);
  }
}

// The repository is public: the stock snapshot may only hold the public fields the website uses.
const TOP_FIELDS = new Set(['_note', 'source', 'snapshotAt', 'vehicles']);
const CAR_FIELDS = new Set(['id', 'brand', 'model', 'year', 'colour', 'transmission', 'cashPriceRM', 'loanPriceRM', 'photos', 'featured']);
const inventory = JSON.parse(await readFile('content/inventory.json', 'utf-8'));
for (const key of Object.keys(inventory)) if (!TOP_FIELDS.has(key)) problems.push(`content/inventory.json: unexpected field "${key}"`);
(inventory.vehicles ?? []).forEach((car, i) => {
  for (const key of Object.keys(car)) if (!CAR_FIELDS.has(key)) problems.push(`content/inventory.json: car #${i + 1} has non-public field "${key}"`);
});

if (problems.length) {
  console.error(`✗ ${problems.length} problem(s) found:\n` + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
console.log(
  `✓ ${files.length} pages checked: links OK, no TODO text, WhatsApp links on every car page; stock snapshot has public fields only.`,
);
