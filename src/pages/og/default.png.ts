import type { APIRoute } from 'astro';
import { renderOg, png } from '@/lib/og';

export const GET: APIRoute = async () =>
  png(await renderOg({ kicker: 'Open database', title: 'What’s behind your stack?', subtitle: 'Paste your dependencies and see which companies, owners and backers you fund, and what they have documentedly said and done.' }));
