import type { APIRoute, GetStaticPaths } from 'astro';
import { loadDataset } from '@/lib/dataset';
import { buildReport } from '@/lib/report';
import { CATEGORY_LABELS, GRIEVANCE_DESCRIPTIONS, GRIEVANCE_LABELS } from '@/lib/labels';
import { countGrievances, renderOg, png, type OgCard } from '@/lib/og';

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export const getStaticPaths: GetStaticPaths = async () => {
  const data = await loadDataset();
  const cards: { params: { kind: string; id: string }; props: OgCard }[] = [];
  for (const p of data.products) {
    const [r] = buildReport(data, [p.id]);
    const facts = r?.facts.map((f) => f.fact) ?? [];
    cards.push({ params: { kind: 'product', id: p.id }, props: {
      kicker: `${CATEGORY_LABELS[p.category] ?? 'Tool'} · by ${data.entities[p.vendor]?.name ?? p.vendor}`,
      title: p.name,
      subtitle: facts.length ? `${plural(facts.length, 'documented fact')} behind this tool.` : 'No documented fact behind this tool, so far.',
      bar: countGrievances(facts),
    } });
  }
  for (const e of Object.values(data.entities)) {
    const facts = data.facts.filter((f) => f.subject === e.id);
    cards.push({ params: { kind: 'entity', id: e.id }, props: {
      kicker: e.type === 'person' ? 'Person' : 'Organisation',
      title: e.name,
      subtitle: facts.length ? `${plural(facts.length, 'documented fact')}, with sources.` : e.description,
      bar: countGrievances(facts),
    } });
  }
  for (const [id, label] of Object.entries(GRIEVANCE_LABELS)) {
    const n = data.facts.filter((f) => f.grievances.includes(id)).length;
    cards.push({ params: { kind: 'grievance', id }, props: { kicker: `Grievance · ${plural(n, 'fact')}`, title: label, subtitle: GRIEVANCE_DESCRIPTIONS[id], bar: n ? [[id, n]] : [] } });
  }
  for (const [id, label] of Object.entries(CATEGORY_LABELS)) {
    const n = data.products.filter((p) => p.category === id).length;
    cards.push({ params: { kind: 'category', id }, props: { kicker: 'Category', title: label, subtitle: `${plural(n, 'tool')} and who is behind them.` } });
  }
  return cards;
};

export const GET: APIRoute = async ({ props }) => png(await renderOg(props as OgCard));
