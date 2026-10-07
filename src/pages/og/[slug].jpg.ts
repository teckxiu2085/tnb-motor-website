// Share images (Open Graph, 1200×630) for WhatsApp / Facebook previews, made at build time.
// Car photos are only resized — never cropped, filtered or edited.
import type { APIRoute, GetStaticPaths } from 'astro';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { getVehicles } from '../../data/vehicles';

const W = 1200;
const H = 630;

export const getStaticPaths = (async () => {
  const vehicles = await getVehicles();
  return [
    { params: { slug: 'tnb-motor' }, props: { file: null as string | null } },
    ...vehicles
      .filter((v) => v.photoFiles.length > 0)
      .map((v) => ({ params: { slug: v.slug }, props: { file: v.photoFiles[0] as string | null } })),
  ];
}) satisfies GetStaticPaths;

const BG = '#0b0b0c';

/** White rounded plate with the logo, plus the grey · black · red bar underneath (as an SVG overlay). */
async function brandBlock(logoHeight: number) {
  const logo = await sharp(resolve(process.cwd(), 'src/assets/brand/logo-trimmed.png'))
    .resize({ height: logoHeight })
    .png()
    .toBuffer({ resolveWithObject: true });
  const padX = Math.round(logoHeight * 0.24);
  const padY = Math.round(logoHeight * 0.17);
  const plateW = logo.info.width + padX * 2;
  const plateH = logo.info.height + padY * 2;
  return { logo: logo.data, logoW: logo.info.width, logoH: logo.info.height, padX, padY, plateW, plateH };
}

function triBarSvg(width: number, height: number): Buffer {
  const seg = (width - 2 * 8) / 3;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<rect x="0" y="0" width="${seg}" height="${height}" fill="#a8a8a8"/>` +
      `<rect x="${seg + 8 + 1}" y="1" width="${seg - 2}" height="${height - 2}" fill="#000" stroke="#3a3a3d" stroke-width="2"/>` +
      `<rect x="${2 * seg + 16}" y="0" width="${seg}" height="${height}" fill="#e30b07"/>` +
      `</svg>`,
  );
}

function plateSvg(w: number, h: number): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${Math.round(h * 0.1)}" fill="#fff"/></svg>`,
  );
}

/** Whole car photo (only resized, never cropped or edited) on the right, TnB logo plate on the left. */
async function carImage(file: string): Promise<Buffer> {
  const photo = await sharp(resolve(process.cwd(), 'src/assets/cars', file))
    .resize({ height: H })
    .toBuffer({ resolveWithObject: true });
  const panelW = W - photo.info.width;
  const b = await brandBlock(150);
  const barW = 240;
  const blockH = b.plateH + 36 + 8;
  const plateLeft = Math.round((panelW - b.plateW) / 2);
  const plateTop = Math.round((H - blockH) / 2);
  return sharp({ create: { width: W, height: H, channels: 3, background: BG } })
    .composite([
      { input: photo.data, left: panelW, top: 0 },
      { input: plateSvg(b.plateW, b.plateH), left: plateLeft, top: plateTop },
      { input: b.logo, left: plateLeft + b.padX, top: plateTop + b.padY },
      { input: triBarSvg(barW, 8), left: Math.round((panelW - barW) / 2), top: plateTop + b.plateH + 36 },
    ])
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();
}

/** Site-wide share image: the logo on white. */
async function siteImage(): Promise<Buffer> {
  const logo = await sharp(resolve(process.cwd(), 'src/assets/brand/logo-trimmed.png')).resize({ height: 360 }).toBuffer();
  return sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } })
    .composite([{ input: logo, gravity: 'center' }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

export const GET: APIRoute = async ({ props }) => {
  const body = props.file ? await carImage(props.file) : await siteImage();
  return new Response(new Uint8Array(body), { headers: { 'Content-Type': 'image/jpeg' } });
};
