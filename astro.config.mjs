// @ts-check
import { defineConfig, fontProviders } from 'astro/config';

const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';

// GitHub Pages project site: https://teckxiu2085.github.io/tnb-motor-website/
// If TnB later uses its own domain, change `site` to that domain and `base` to '/'.
export default defineConfig({
  site: 'https://teckxiu2085.github.io',
  base: '/tnb-motor-website',
  trailingSlash: 'always',
  build: { format: 'directory' },
  // Fonts are self-hosted from the installed @fontsource packages (no Google Fonts requests, works offline).
  fonts: [
    {
      provider: fontProviders.local(),
      name: 'Montserrat',
      cssVariable: '--font-display',
      fallbacks: ['sans-serif'],
      options: {
        variants: [
          {
            src: ['./node_modules/@fontsource-variable/montserrat/files/montserrat-latin-wght-normal.woff2'],
            weight: '100 900',
            style: 'normal',
            unicodeRange: [LATIN],
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: 'JetBrains Mono',
      cssVariable: '--font-mono',
      fallbacks: ['monospace'],
      options: {
        variants: [
          {
            src: ['./node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2'],
            weight: '100 800',
            style: 'normal',
            unicodeRange: [LATIN],
          },
        ],
      },
    },
  ],
});
