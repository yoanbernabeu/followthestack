import type { APIRoute } from 'astro';
import { loadDataset } from '@/lib/dataset';

export const GET: APIRoute = async () => new Response(JSON.stringify(await loadDataset()), {
  headers: { 'Content-Type': 'application/json' },
});
