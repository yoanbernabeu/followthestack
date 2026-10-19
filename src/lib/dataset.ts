import { getCollection } from 'astro:content';
import type { Dataset, Entity } from './types';

const iso = (d?: Date) => (d ? d.toISOString() : undefined);
const src = (s: { url: string; outlet: string; date?: Date; archive?: string }) => ({ ...s, date: iso(s.date) });

export async function loadDataset(): Promise<Dataset> {
  const [entities, products, facts] = await Promise.all([
    getCollection('entities'),
    getCollection('products'),
    getCollection('facts'),
  ]);
  const ents: Record<string, Entity> = {};
  for (const e of entities) {
    ents[e.id] = {
      id: e.id,
      name: e.data.name,
      type: e.data.type,
      description: e.data.description,
      country: e.data.country,
      website: e.data.website,
      relations: e.data.relations.map((r) => ({
        target: r.target.id,
        role: r.role,
        since: iso(r.since),
        until: iso(r.until),
        sources: r.sources.map(src),
      })),
    };
  }
  return {
    entities: ents,
    products: products
      .map((p) => ({ id: p.id, ...p.data, vendor: p.data.vendor.id, alternatives: p.data.alternatives.map((a) => a.id) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    facts: facts
      .map((f) => ({
        id: f.id,
        ...f.data,
        subject: f.data.subject.id,
        date: f.data.date.toISOString(),
        sources: f.data.sources.map(src),
      }))
      .sort((a, b) => b.date.localeCompare(a.date)),
  };
}
