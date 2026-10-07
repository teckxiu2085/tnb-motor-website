/** Prefix a site-internal path with the configured base (e.g. "/tnb-motor-website/"). */
export function withBase(path = ''): string {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return base + path.replace(/^\/+/, '');
}

/** Absolute URL for sharing, canonical links and WhatsApp messages. */
export function absoluteUrl(path: string, site: URL | undefined): string {
  return new URL(withBase(path), site ?? 'https://teckxiu2085.github.io').href;
}

export const carPath = (slug: string) => `cars/${slug}/`;
