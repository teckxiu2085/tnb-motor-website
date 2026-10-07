// Only takes effect when the site runs on its own domain (base "/"); on github.io the sitemap is submitted
// in Google Search Console instead.
import type { APIRoute } from 'astro';
import { absoluteUrl } from '../lib/url';

export const GET: APIRoute = ({ site }) =>
  new Response(`User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl('sitemap.xml', site)}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
