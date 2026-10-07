// One-off helper: makes web-ready copies of the official logo.
// It only trims the empty white margin (and crops the key+car icon for the favicon).
// The logo itself is never redrawn or recoloured. Run: node scripts/prepare-brand.mjs
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const SRC = 'public/brand/logo.png';
const OUT = 'src/assets/brand';
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

await mkdir(OUT, { recursive: true });

// Full logo, white margin trimmed.
const trimmed = await sharp(SRC).trim({ background: '#ffffff', threshold: 12 }).png().toBuffer({ resolveWithObject: true });
await sharp(trimmed.data).toFile(`${OUT}/logo-trimmed.png`);
console.log('logo-trimmed.png', trimmed.info.width, 'x', trimmed.info.height);

// Key + car icon only (top part of the logo), padded to a white square for the favicon.
const { width, height } = await sharp(SRC).metadata();
const iconBand = await sharp(SRC).extract({ left: 0, top: 0, width, height: Math.round(height * 0.38) }).toBuffer();
const icon = await sharp(iconBand).trim({ background: '#ffffff', threshold: 12 }).toBuffer({ resolveWithObject: true });
const side = Math.round(Math.max(icon.info.width, icon.info.height) * 1.18);
const square = await sharp({ create: { width: side, height: side, channels: 4, background: WHITE } })
  .composite([{ input: icon.data, gravity: 'center' }])
  .png()
  .toBuffer();
for (const size of [32, 180, 512]) {
  await sharp(square).resize(size, size).png().toFile(`public/brand/icon-${size}.png`);
}
console.log('icon', icon.info.width, 'x', icon.info.height, '-> square', side);
