import type { APIRoute } from 'astro';
import { loadDataset } from '@/lib/dataset';
import { llmsFullTxt, text } from '@/lib/llms';

export const GET: APIRoute = async ({ site }) => text(llmsFullTxt(await loadDataset(), site));
