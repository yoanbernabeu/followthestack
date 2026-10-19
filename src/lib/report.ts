import type { Dataset, Entity, Fact, Product } from './types';
import type { Detected } from './parsers';

export type LinkKind = 'direct' | 'indirect' | 'former';
export type ChainLink = { entity: Entity; kind: LinkKind; via: { role: string; from: string; until?: string }[] };
export type ProductReport = {
  product: Product;
  chain: ChainLink[];
  facts: { fact: Fact; entity: Entity; kind: LinkKind; via: ChainLink['via'] }[];
  grievances: string[];
};

// Who controls the vendor: parents and controlling owners (followed further), and the people running them.
const CONTROL = new Set(['subsidiary-of', 'owned-by']);
const PEOPLE = new Set(['led-by', 'founded-by', 'board-member']);

/**
 * Walk from the vendor to the entities behind it.
 * Direct: the vendor, its parents and controlling owners, and their leaders, founders and board members.
 * Indirect (opt-in): minority investors, and everything behind them, up to maxDepth.
 */
export function ownershipChain(data: Dataset, vendorId: string, includeIndirect = false, includeFormer = false, maxDepth = 3): ChainLink[] {
  const out: ChainLink[] = [];
  const seen = new Map<string, LinkKind>();
  const queue: { id: string; kind: LinkKind; via: ChainLink['via']; depth: number }[] = [
    { id: vendorId, kind: 'direct', via: [], depth: 0 },
  ];
  while (queue.length) {
    const { id, kind, via, depth } = queue.shift()!;
    // A direct path always wins over an indirect one to the same entity.
    const rank = { direct: 0, former: 1, indirect: 2 } as const;
    if (seen.has(id) && rank[seen.get(id)!] <= rank[kind]) continue;
    const entity = data.entities[id];
    if (!entity) continue;
    if (seen.has(id)) out.splice(out.findIndex((c) => c.entity.id === id), 1);
    seen.set(id, kind);
    out.push({ entity, kind, via });
    if (depth >= maxDepth) continue;
    for (const r of entity.relations) {
      const next = { id: r.target, via: [...via, { role: r.role, from: entity.name, until: r.until }], depth: depth + 1 };
      // A link that has ended (founder or leader who left, former owner) is only followed on demand.
      if (r.until) {
        if (includeFormer && kind !== 'indirect') queue.push({ ...next, kind: 'former' });
        continue;
      }
      if (kind === 'direct' && (CONTROL.has(r.role) || PEOPLE.has(r.role))) queue.push({ ...next, kind: 'direct' });
      else if (kind === 'former' && (CONTROL.has(r.role) || PEOPLE.has(r.role))) queue.push({ ...next, kind: 'former' });
      else if (includeIndirect) queue.push({ ...next, kind: 'indirect' });
    }
  }
  return out;
}

// Returns, for each matched product, the dependency keys that matched (e.g. "composer: stripe/stripe-php").
export function matchProductsDetailed(data: Dataset, detected: Detected): Map<string, string[]> {
  const hits = new Map<string, string[]>();
  const add = (id: string, why: string) => hits.set(id, [...new Set([...(hits.get(id) ?? []), why])]);
  for (const p of data.products) {
    for (const eco of ['npm', 'composer', 'gems', 'pypi', 'docker'] as const) {
      for (const key of p.detect[eco] ?? []) {
        const k = key.toLowerCase();
        if (k.endsWith('/*')) {
          const prefix = k.slice(0, -1);
          [...detected[eco]].filter((d) => d.startsWith(prefix)).forEach((d) => add(p.id, `${eco}: ${d}`));
        } else if (detected[eco].has(k) || (eco === 'docker' && detected.docker.has(k.replace(/^library\//, '')))) {
          add(p.id, `${eco}: ${k}`);
        }
      }
    }
  }
  return hits;
}

export function matchProducts(data: Dataset, detected: Detected): Set<string> {
  return new Set(matchProductsDetailed(data, detected).keys());
}

export function buildReport(data: Dataset, productIds: Iterable<string>, includeIndirect = false, includeFormer = false): ProductReport[] {
  const factsBySubject = new Map<string, Fact[]>();
  for (const f of data.facts) factsBySubject.set(f.subject, [...(factsBySubject.get(f.subject) ?? []), f]);
  const reports: ProductReport[] = [];
  for (const id of new Set(productIds)) {
    const product = data.products.find((p) => p.id === id);
    if (!product) continue;
    const chain = ownershipChain(data, product.vendor, includeIndirect, includeFormer);
    const facts = chain.flatMap((c) => (factsBySubject.get(c.entity.id) ?? []).map((fact) => ({ fact, entity: c.entity, kind: c.kind, via: c.via })));
    const order = { direct: 0, former: 1, indirect: 2 } as const;
    facts.sort((a, b) => order[a.kind] - order[b.kind] || b.fact.date.localeCompare(a.fact.date));
    const grievances = [...new Set(facts.flatMap((f) => f.fact.grievances))];
    reports.push({ product, chain, facts, grievances });
  }
  return reports.sort((a, b) => b.facts.length - a.facts.length || a.product.name.localeCompare(b.product.name));
}
