// Stock sync: Google Sheet (via 修哥's private Apps Script) → public snapshot for the website.
//
//   content/inventory.json          public fields only (committed)
//   src/assets/cars/live/<key>.jpg  photos from each car's Google Drive folder, resized
//                                   (NOT committed: kept in the GitHub Actions cache)
//
// Run: npm run sync   (GitHub Actions runs it every hour before building.)
// Needs STOCK_API_URL + STOCK_API_TOKEN (GitHub secrets). Without them it does nothing, so the
// website keeps using the snapshot that is already in the repository.
//
// Pricing rules and costs live only in the Apps Script, never here. This script receives website
// prices that are already final.
//
// The GitHub Actions log of a public repository is public: print counts only — never car names,
// prices, ids, file ids or plates.
import { appendFile, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { baseSlug, detectTransmission, normaliseColour, parseYear, splitName } from '../src/data/normalise.js';

const ROOT = resolve(process.env.SYNC_ROOT ?? '.');
const INVENTORY = join(ROOT, 'content/inventory.json');
const LEGACY = join(ROOT, 'content/legacy.json');
const LIVE_DIR = join(ROOT, 'src/assets/cars/live');
const API_URL = process.env.STOCK_API_URL?.trim();
const TOKEN = process.env.STOCK_API_TOKEN?.trim();
const FORCE = /^(1|true|yes)$/i.test(process.env.SYNC_FORCE ?? '');

const SOURCE = 'stock-sheet';
const MAX_PHOTOS = 10;
const MAX_CARS = 400;
const PHOTO_EDGE = 1600;
const PHOTO_CONCURRENCY = 4;
const FEED_TIMEOUT_MS = 330_000; // the Apps Script may take a few minutes when it creates many folders
const PHOTO_TIMEOUT_MS = 120_000;

// Errors from the Apps Script that are worth retrying, or skipping until the next hourly run.
const TRANSIENT = new Set(['busy', 'timeout']);
const EXPLAIN = {
  unauthorized: '密码不对：GitHub 里的 STOCK_API_TOKEN 要跟 Google 表菜单「TnB Website → 显示网站密码」一样。',
  'not-setup': 'Apps Script 还没设定好：请在 Apps Script 里执行一次 setup。',
  'sheet-not-found': 'Google 表里找不到「STOCKLIST TNB」这一页（是不是改了名字？）。',
  'columns-missing': 'Google 表的表头被改了，找不到 Plate Number / Year / Colour / Cash / Loan。',
  server: 'Apps Script 出错了。请打开 Apps Script → 执行（Executions）看看错误。',
};

class SyncError extends Error {
  constructor(message, { transient = false } = {}) {
    super(message);
    this.transient = transient;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (msg) => console.log(msg);

async function output(name, value) {
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

async function summary(lines) {
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
}

/** GET the Apps Script web app. Never puts the URL or token into an error message. */
async function callApi(params, { timeoutMs, attempts }) {
  const url = new URL(API_URL);
  url.searchParams.set('token', TOKEN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      let res;
      try {
        res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
      } catch (err) {
        throw new SyncError(`连不上 Google（${err.name === 'TimeoutError' ? '超时' : '网络错误'}）`, { transient: true });
      }
      if (!res.ok) throw new SyncError(`Google 回复 HTTP ${res.status}`, { transient: res.status >= 500 || res.status === 429 });
      const text = await res.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        throw new SyncError('Google 回复的不是资料（网页应用的「谁可以访问」要选「所有人」，并且要用最新的部署网址）。');
      }
      if (body && body.ok === false) {
        const code = String(body.error ?? 'server');
        if (TRANSIENT.has(code)) throw new SyncError(`Apps Script 忙（${code}）`, { transient: true });
        if (params.photo && (code === 'not-found' || code === 'too-big')) return body;
        throw new SyncError(EXPLAIN[code] ?? `Apps Script 回复错误（${code.slice(0, 40)}）`);
      }
      return body;
    } catch (err) {
      lastError = err;
      if (!(err instanceof SyncError) || !err.transient || attempt === attempts) throw err;
      await sleep(5000 * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

const isPrice = (v) => v === null || (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 10_000_000);

function validCar(c) {
  return (
    c &&
    typeof c.id === 'string' &&
    /^v-[0-9a-f]{20}(-\d+)?$/.test(c.id) &&
    typeof c.name === 'string' &&
    c.name.trim().split(/\s+/).length >= 2 &&
    typeof c.year === 'string' &&
    /^\d{2,4}(\/\d{2,4})?$/.test(c.year) &&
    typeof c.colour === 'string' &&
    isPrice(c.cashPriceRM) &&
    isPrice(c.loanPriceRM) &&
    typeof c.featured === 'boolean' &&
    Array.isArray(c.photos) &&
    c.photos.every((p) => p && /^p-[0-9a-f]{16}$/.test(p.key) && typeof p.file === 'string' && /^[\w-]{10,200}$/.test(p.file))
  );
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/** Runs tasks with a small pool of workers. */
async function pool(items, size, task) {
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await task(items[i], i);
    }
  });
  await Promise.all(workers);
}

/** Download one photo through the Apps Script and save it upright, at most 1600 px, as JPEG. Only resized and compressed. */
async function downloadPhoto(photo) {
  const target = join(LIVE_DIR, `${photo.key}.jpg`);
  const body = await callApi({ photo: photo.file }, { timeoutMs: PHOTO_TIMEOUT_MS, attempts: 2 });
  if (!body?.ok || typeof body.data !== 'string') return false;
  const temp = `${target}.tmp`;
  await sharp(Buffer.from(body.data, 'base64'), { failOn: 'error' })
    .rotate() // apply the phone's orientation; metadata (including GPS location) is not copied
    .resize({ width: PHOTO_EDGE, height: PHOTO_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(temp);
  await rename(temp, target);
  return true;
}

async function main() {
  if (!API_URL || !TOKEN) {
    log('库存同步：还没有设定 STOCK_API_URL / STOCK_API_TOKEN，跳过（网站继续用仓库里的库存快照）。');
    await output('changed', 'false');
    return;
  }

  const previous = await readJson(INVENTORY, null);
  const legacy = await readJson(LEGACY, { cars: {}, featured: [] });

  // 1) Stock list
  const feed = await callApi({}, { timeoutMs: FEED_TIMEOUT_MS, attempts: 3 });
  if (!feed || feed.version !== 1 || !Array.isArray(feed.cars)) throw new SyncError('Apps Script 回复的格式不对（version / cars）。');
  const cars = feed.cars.filter(validCar);
  const invalid = feed.cars.length - cars.length;
  if (invalid > Math.max(3, feed.cars.length * 0.1)) throw new SyncError(`有 ${invalid} 辆车的资料格式不对，这次不更新。`);

  // 2) Safety checks: a sudden big change is more likely a mistake in the sheet than real stock.
  const prevCount = previous?.vehicles?.length ?? 0;
  const fromSheet = previous?.source === SOURCE;
  if (cars.length === 0) throw new SyncError('Google 表读到 0 辆车，这次不更新（网站保持原样）。');
  if (cars.length > MAX_CARS) throw new SyncError(`读到 ${cars.length} 辆车，太多了，可能把卖车记录也读进来了。这次不更新。`);
  if (!FORCE && prevCount >= 10) {
    if (cars.length < prevCount * 0.5)
      throw new SyncError(`车数从 ${prevCount} 辆突然变成 ${cars.length} 辆（少了一半以上）。如果没错，请手动执行一次并勾选 force。`);
    // (not on the first sync: the first snapshot only had part of the stock)
    if (fromSheet && cars.length > prevCount * 2)
      throw new SyncError(`车数从 ${prevCount} 辆突然变成 ${cars.length} 辆（多了一倍以上）。如果没错，请手动执行一次并勾选 force。`);
  }

  // 3) Photos: download only the ones not cached yet.
  await mkdir(LIVE_DIR, { recursive: true });
  const cached = new Set((await readdir(LIVE_DIR)).filter((f) => f.endsWith('.jpg')).map((f) => f.slice(0, -4)));
  const wanted = new Map();
  for (const car of cars) for (const p of car.photos.slice(0, MAX_PHOTOS)) wanted.set(p.key, p);
  const missing = [...wanted.values()].filter((p) => !cached.has(p.key));
  let downloaded = 0;
  let failed = 0;
  await pool(missing, PHOTO_CONCURRENCY, async (photo) => {
    try {
      if (await downloadPhoto(photo)) {
        downloaded++;
        cached.add(photo.key);
      } else failed++;
    } catch {
      failed++;
    }
  });

  // 4) Public snapshot
  const slugCount = new Map();
  const prepared = cars.map((car) => {
    const { brand, model } = splitName(car.name);
    const { year } = parseYear(car.year);
    const slug = baseSlug({ brand, model, year, colour: normaliseColour(car.colour) });
    slugCount.set(slug, (slugCount.get(slug) ?? 0) + 1);
    return { car, brand, model, slug };
  });
  const anyFeatured = cars.some((c) => c.featured);
  let livePhotoCars = 0;
  let legacyPhotoCars = 0;

  const vehicles = prepared.map(({ car, brand, model, slug }) => {
    // Old photos and details from the first snapshot, matched by page address (only when unambiguous).
    const old = slugCount.get(slug) === 1 ? legacy.cars?.[slug] : undefined;
    const live = car.photos
      .slice(0, MAX_PHOTOS)
      .filter((p) => cached.has(p.key))
      .map((p) => `/cars/live/${p.key}.jpg`);
    const photos = live.length ? live : (old?.photos ?? []).map((f) => `/cars/${f}`);
    if (live.length) livePhotoCars++;
    else if (photos.length) legacyPhotoCars++;
    return {
      id: car.id,
      brand,
      model,
      year: car.year,
      colour: car.colour.trim(),
      transmission: detectTransmission(model) ?? old?.transmission ?? null,
      cashPriceRM: car.cashPriceRM,
      loanPriceRM: car.loanPriceRM,
      photos,
      featured: anyFeatured ? car.featured : (legacy.featured ?? []).includes(slug),
    };
  });

  // 5) Remove photos of cars that are gone (sold, hidden or photo replaced).
  const used = new Set(vehicles.flatMap((v) => v.photos).filter((p) => p.startsWith('/cars/live/')).map((p) => p.slice(11, -4)));
  let removed = 0;
  for (const file of await readdir(LIVE_DIR)) {
    const key = file.replace(/\.jpg(\.tmp)?$/, '');
    if (file.endsWith('.tmp') || !used.has(key)) {
      await rm(join(LIVE_DIR, file), { force: true });
      if (file.endsWith('.jpg')) removed++;
    }
  }

  const changed = !fromSheet || JSON.stringify(previous.vehicles) !== JSON.stringify(vehicles);
  if (changed) {
    const snapshot = {
      _note:
        'Written by scripts/sync-stock.mjs from the stock sheet (public fields only). Do not edit by hand: the next sync overwrites it. null price = "Ask for price". year like "18/22" = made 2018, registered 2022 (recond).',
      source: SOURCE,
      snapshotAt: new Date().toISOString(),
      vehicles,
    };
    await writeFile(INVENTORY, JSON.stringify(snapshot, null, 2) + '\n');
  }

  const prevIds = new Set((previous?.vehicles ?? []).map((v) => v.id));
  const nowIds = new Set(vehicles.map((v) => v.id));
  const added = fromSheet ? [...nowIds].filter((id) => !prevIds.has(id)).length : null;
  const gone = fromSheet ? [...prevIds].filter((id) => !nowIds.has(id)).length : null;
  const priced = vehicles.filter((v) => v.cashPriceRM !== null || v.loanPriceRM !== null).length;

  const lines = [
    `库存同步：${vehicles.length} 辆车，${priced} 辆有价钱。`,
    `照片：${livePhotoCars} 辆用 Google Drive 照片，${legacyPhotoCars} 辆用旧照片；这次下载 ${downloaded} 张${failed ? `，失败 ${failed} 张（下次再试）` : ''}，清理 ${removed} 张。`,
    added === null ? '第一次从 Google 表同步。' : `跟上次比：新车 ${added} 辆，下架 ${gone} 辆。`,
    invalid ? `⚠️ 有 ${invalid} 辆车资料格式不对，没有放上网站。` : '',
    changed ? '库存有变化 → 更新网站。' : '库存没有变化。',
  ].filter(Boolean);
  lines.forEach((l) => log(l));
  await summary(['### 库存同步', '', ...lines.map((l) => `- ${l}`)]);
  if (failed) log(`::warning::有 ${failed} 张照片下载失败，下次同步会再试。`);
  if (invalid) log(`::warning::有 ${invalid} 辆车资料格式不对，没有放上网站。`);

  await output('changed', String(changed));
  await output('photos-changed', String(downloaded > 0 || removed > 0));
  await output('cars', String(vehicles.length));
}

main().catch(async (err) => {
  const message = err instanceof SyncError ? err.message : '同步程序出错。';
  if (!(err instanceof SyncError)) console.error(err?.stack ?? err);
  await output('changed', 'false');
  if (err instanceof SyncError && err.transient) {
    // Google is busy or unreachable: keep the current website, try again next hour.
    log(`::warning::库存同步这次跳过：${message} 网站保持原样，下个小时再试。`);
    return;
  }
  log(`::error::库存同步失败：${message} 网站保持原样。`);
  await summary(['### 库存同步失败', '', `- ${message}`, '- 网站保持原样（还是上一次的库存）。']);
  process.exitCode = 1;
});
