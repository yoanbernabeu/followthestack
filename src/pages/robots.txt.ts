import type { APIRoute } from 'astro';

// Search engines and AI crawlers are welcome: the point is for the facts to be found.
export const GET: APIRoute = ({ site }) => {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${new URL(`${base}sitemap-index.xml`, site).href}\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
