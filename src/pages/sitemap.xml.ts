// sitemap.xml for search engines: home, car list and every car page.
import type { APIRoute } from 'astro';
import { getSnapshotDate, getVehicles } from '../data/vehicles';
import { absoluteUrl, carPath } from '../lib/url';

export const GET: APIRoute = async ({ site }) => {
  const vehicles = await getVehicles();
  const snapshot = await getSnapshotDate();
  const lastmod = (snapshot ? new Date(snapshot) : new Date()).toISOString().slice(0, 10);
  const urls = [
    { loc: absoluteUrl('/', site), priority: '1.0' },
    { loc: absoluteUrl('cars/', site), priority: '0.9' },
    ...vehicles.map((v) => ({ loc: absoluteUrl(carPath(v.slug), site), priority: '0.8' })),
  ];
  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls
      .map((u) => `  <url><loc>${u.loc}</loc><lastmod>${lastmod}</lastmod><priority>${u.priority}</priority></url>`)
      .join('\n') +
    '\n</urlset>\n';
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
