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
