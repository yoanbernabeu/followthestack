import type { APIRoute } from 'astro';
import { loadDataset } from '@/lib/dataset';
import { llmsTxt, text } from '@/lib/llms';

export const GET: APIRoute = async ({ site }) => text(llmsTxt(await loadDataset(), site));
