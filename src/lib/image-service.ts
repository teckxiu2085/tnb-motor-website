// Astro's built-in sharp image service, plus one extra: a focal-point crop.
// When an image is requested with a fixed width + height and a percentage position such as "50% 62%",
// the photo is first cropped to that aspect ratio around the focal point, then resized and encoded as usual.
// Car cards use this to download only the 4:3 part of the portrait photos that is actually shown.
// (Only cropping and resizing — the photo itself is never edited.)
import type { LocalImageService } from 'astro';
import sharpService from 'astro/assets/services/sharp';
import sharp from 'sharp';

const base = sharpService as LocalImageService;
const FOCAL = /^(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/;

const service: LocalImageService = {
  ...base,
  async transform(inputBuffer, transform, config, ...rest) {
    const focal = typeof transform.position === 'string' ? transform.position.match(FOCAL) : null;
    if (!focal || !transform.width || !transform.height) return base.transform(inputBuffer, transform, config, ...rest);

    const upright = await sharp(inputBuffer).rotate().toBuffer({ resolveWithObject: true });
    const { width: w, height: h } = upright.info;
    const ratio = transform.width / transform.height;
    let cropW = w;
    let cropH = Math.round(w / ratio);
    if (cropH > h) {
      cropH = h;
      cropW = Math.round(h * ratio);
    }
    const left = Math.round(((w - cropW) * Number(focal[1])) / 100);
    const top = Math.round(((h - cropH) * Number(focal[2])) / 100);
    const cropped = await sharp(upright.data).extract({ left, top, width: cropW, height: cropH }).toBuffer();

    return base.transform(cropped, { ...transform, position: undefined, fit: 'cover' }, config, ...rest);
  },
};

export default service;
