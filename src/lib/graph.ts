import type { Dataset } from './types';
import { ownershipChain } from './report';
import { url } from './urls';

// Entities and products share slugs (e.g. `hp`), so graph ids are prefixed.
export const entityNode = (id: string) => `e:${id}`;
export const productNode = (id: string) => `p:${id}`;

export type GraphNode = {
  id: string;
  label: string;
  kind: string; // entity type, or 'product'
  facts: number; // facts on the entity itself; for a product, facts reaching it directly
  grievances: string[];
  href: string;
};
export type GraphEdge = { id: string; source: string; target: string; role: string; former: boolean };
export type Graph = { nodes: GraphNode[]; edges: GraphEdge[] };
export type GraphOptions = { products: boolean; former: boolean; indirect: boolean };

/** Every entity and product, with the relations the options allow. */
export function fullGraph(data: Dataset, opts: GraphOptions): Graph {
  const own = new Map<string, { n: number; g: Set<string> }>();
  for (const f of data.facts) {
    const o = own.get(f.subject) ?? { n: 0, g: new Set<string>() };
    o.n++;
    f.grievances.forEach((g) => o.g.add(g));
    own.set(f.subject, o);
  }
  const nodes: GraphNode[] = Object.values(data.entities).map((e) => ({
    id: entityNode(e.id),
    label: e.name,
    kind: e.type,
    facts: own.get(e.id)?.n ?? 0,
    grievances: [...(own.get(e.id)?.g ?? [])],
    href: url.entity(e.id),
  }));
  const edges: GraphEdge[] = [];
  for (const e of Object.values(data.entities)) {
    for (const r of e.relations) {
      if (!data.entities[r.target]) continue;
      if (r.until && !opts.former) continue;
      if (r.role === 'invested-by' && !opts.indirect) continue;
      edges.push({ id: `${e.id}>${r.role}>${r.target}`, source: entityNode(e.id), target: entityNode(r.target), role: r.role, former: !!r.until });
    }
  }
  if (opts.products) {
    for (const p of data.products) {
      // Same reach as the product page: direct chain only.
      const chain = ownershipChain(data, p.vendor);
      const reached = chain.flatMap((c) => (own.get(c.entity.id) ? [own.get(c.entity.id)!] : []));
      nodes.push({
        id: productNode(p.id),
        label: p.name,
        kind: 'product',
        facts: reached.reduce((a, o) => a + o.n, 0),
        grievances: [...new Set(reached.flatMap((o) => [...o.g]))],
        href: url.product(p.id),
      });
      edges.push({ id: `${p.id}>made-by>${p.vendor}`, source: productNode(p.id), target: entityNode(p.vendor), role: 'made-by', former: false });
    }
  }
  return { nodes, edges };
}

/** The subgraph induced by a set of node ids. */
export function induced(g: Graph, ids: Set<string>): Graph {
  return { nodes: g.nodes.filter((n) => ids.has(n.id)), edges: g.edges.filter((e) => ids.has(e.source) && ids.has(e.target)) };
}

/** Nodes within `depth` hops of the centres, ignoring edge direction. */
export function neighbourhood(g: Graph, centres: string[], depth: number, limit = 120): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of g.edges) {
    adj.set(e.source, [...(adj.get(e.source) ?? []), e.target]);
    adj.set(e.target, [...(adj.get(e.target) ?? []), e.source]);
  }
  const seen = new Set(centres);
  let frontier = centres;
  for (let d = 0; d < depth && frontier.length; d++) {
    const next: string[] = [];
    for (const id of frontier) for (const n of adj.get(id) ?? []) if (!seen.has(n)) { seen.add(n); next.push(n); }
    // Stop growing rather than drawing an unreadable hairball around very connected nodes.
    if (seen.size > limit && d > 0) break;
    frontier = next;
  }
  return seen;
}

/** The products and everything the propagation rules attach to them. */
export function chainNodes(data: Dataset, productIds: string[], indirect: boolean, former: boolean): Set<string> {
  const ids = new Set<string>();
  for (const id of productIds) {
    const p = data.products.find((x) => x.id === id);
    if (!p) continue;
    ids.add(productNode(p.id));
    for (const c of ownershipChain(data, p.vendor, indirect, former)) ids.add(entityNode(c.entity.id));
  }
  return ids;
}

export type Concentration = {
  edgeFlow: Map<string, number>; // facts flowing through each `source|target` pair, towards products
  reach: Map<string, Set<string>>; // entity node id -> product ids it reaches
  productFacts: Map<string, number>; // product node id -> facts reaching it
};

const CONTROL = new Set(['subsidiary-of', 'owned-by']);
const PEOPLE = new Set(['led-by', 'founded-by', 'board-member']);

/**
 * Where facts concentrate: for each product, walk the same chain as the report
 * (direct links, plus investors or former links when asked) and push the facts of
 * every entity reached down the path to the product.
 */
export function concentration(data: Dataset, productIds: string[], opts: Pick<GraphOptions, 'indirect' | 'former'>): Concentration {
  const own = new Map<string, number>();
  for (const f of data.facts) own.set(f.subject, (own.get(f.subject) ?? 0) + 1);
  const edgeFlow = new Map<string, number>();
  const reach = new Map<string, Set<string>>();
  const productFacts = new Map<string, number>();
  for (const pid of productIds) {
    const p = data.products.find((x) => x.id === pid);
    if (!p || !data.entities[p.vendor]) continue;
    type Step = { id: string; kind: 'direct' | 'former' | 'indirect'; path: string[]; depth: number };
    const queue: Step[] = [{ id: p.vendor, kind: 'direct', path: [`${productNode(pid)}|${entityNode(p.vendor)}`], depth: 0 }];
    const seen = new Set<string>();
    let total = 0;
    while (queue.length) {
      const s = queue.shift()!;
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      const node = entityNode(s.id);
      reach.set(node, (reach.get(node) ?? new Set()).add(pid));
      const n = own.get(s.id) ?? 0;
      if (n) {
        total += n;
        for (const k of s.path) edgeFlow.set(k, (edgeFlow.get(k) ?? 0) + n);
      }
      if (s.depth >= 3) continue;
      for (const r of data.entities[s.id]?.relations ?? []) {
        const key = `${node}|${entityNode(r.target)}`;
        const next = { id: r.target, path: [...s.path, key], depth: s.depth + 1 };
        const followed = CONTROL.has(r.role) || PEOPLE.has(r.role);
        if (r.until) { if (opts.former && s.kind !== 'indirect' && followed) queue.push({ ...next, kind: 'former' }); continue; }
        if (s.kind !== 'indirect' && followed) queue.push({ ...next, kind: s.kind });
        else if (opts.indirect) queue.push({ ...next, kind: 'indirect' });
      }
    }
    productFacts.set(productNode(pid), total);
  }
  return { edgeFlow, reach, productFacts };
}
