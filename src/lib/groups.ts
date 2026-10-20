import type { Dataset, Fact } from './types';
import { ownershipChain } from './report';

export type GroupMember = { id: string; name: string; type: string; facts: number };
export type GroupProduct = {
  id: string;
  name: string;
  category: string;
  facts: number; // facts reaching it through its direct chain, as on the product page
  alternatives: { id: string; name: string; facts: number }[];
};
export type Group = {
  id: string;
  label: string;
  members: GroupMember[]; // members carrying facts first
  facts: Pick<Fact, 'id' | 'subject' | 'grievances' | 'date' | 'datePrecision' | 'summary' | 'status'>[];
  grievances: Record<string, number>; // facts per grievance
  products: GroupProduct[];
  categories: string[];
};

// Current control and leadership links tie companies and people into one group.
const TIES = new Set(['subsidiary-of', 'owned-by', 'led-by', 'founded-by', 'board-member']);
const CONTROL = new Set(['subsidiary-of', 'owned-by']);

/**
 * Groups of companies and people bound by current control or leadership links
 * (a parent and its subsidiaries, their leaders, founders and board members),
 * with the facts they carry and the products they make. Only groups with facts.
 */
export function buildGroups(data: Dataset): Group[] {
  // Every page of a build loads its own copy of the same dataset: compute the groups once per content.
  const key = JSON.stringify(data);
  if (cache?.key !== key) cache = { key, groups: compute(data) };
  return cache.groups;
}

let cache: { key: string; groups: Group[] } | undefined;

/** The group each entity belongs to, if that group carries facts. */
export function groupOf(data: Dataset, entityId: string): Group | undefined {
  return buildGroups(data).find((g) => g.members.some((m) => m.id === entityId));
}

function compute(data: Dataset): Group[] {
  const E = data.entities;
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const r = find(p);
    parent.set(x, r);
    return r;
  };
  for (const e of Object.values(E)) {
    for (const r of e.relations) if (!r.until && TIES.has(r.role) && E[r.target]) parent.set(find(e.id), find(r.target));
  }

  const factsOf = new Map<string, Fact[]>();
  for (const f of data.facts) factsOf.set(f.subject, [...(factsOf.get(f.subject) ?? []), f]);
  const reaching = new Map<string, number>();
  const factsReaching = (productId: string) => {
    if (!reaching.has(productId)) {
      const p = data.products.find((x) => x.id === productId);
      const chain = p ? ownershipChain(data, p.vendor) : [];
      reaching.set(productId, chain.reduce((n, c) => n + (factsOf.get(c.entity.id)?.length ?? 0), 0));
    }
    return reaching.get(productId)!;
  };

  const byRoot = new Map<string, string[]>();
  for (const id of Object.keys(E)) byRoot.set(find(id), [...(byRoot.get(find(id)) ?? []), id]);

  const groups: Group[] = [];
  for (const ids of byRoot.values()) {
    const facts = ids.flatMap((id) => factsOf.get(id) ?? []).sort((a, b) => b.date.localeCompare(a.date));
    if (!facts.length) continue;
    const inGroup = new Set(ids);
    const products = data.products.filter((p) => inGroup.has(p.vendor));
    const productsUnder = (id: string): number => products.filter((p) => ownershipChain(data, p.vendor).some((c) => c.entity.id === id)).length;

    // Companies nobody else in the group controls: the heads of the group.
    const heads = ids.filter((id) => E[id].type !== 'person' && !E[id].relations.some((r) => !r.until && CONTROL.has(r.role) && inGroup.has(r.target)));
    heads.sort((a, b) => productsUnder(b) - productsUnder(a) || (factsOf.get(b)?.length ?? 0) - (factsOf.get(a)?.length ?? 0));
    // Several heads held together by one person (a founder running several companies): name the group after that person.
    const people = ids.filter((id) => E[id].type === 'person');
    const linker = heads.length > 1
      ? people
          .map((id) => ({ id, n: heads.filter((h) => E[id].relations.some((r) => !r.until && r.target === h) || E[h].relations.some((r) => !r.until && r.target === id)).length }))
          .sort((a, b) => b.n - a.n || (factsOf.get(b.id)?.length ?? 0) - (factsOf.get(a.id)?.length ?? 0))[0]
      : undefined;
    const lead = linker && linker.n > 1 ? linker.id : heads[0] ?? ids.sort((a, b) => (factsOf.get(b)?.length ?? 0) - (factsOf.get(a)?.length ?? 0))[0];

    const grievances: Record<string, number> = {};
    for (const f of facts) for (const g of f.grievances) grievances[g] = (grievances[g] ?? 0) + 1;
    groups.push({
      id: lead,
      label: E[lead].name,
      members: ids
        .map((id) => ({ id, name: E[id].name, type: E[id].type, facts: factsOf.get(id)?.length ?? 0 }))
        .sort((a, b) => b.facts - a.facts || a.name.localeCompare(b.name)),
      facts: facts.map(({ id, subject, grievances, date, datePrecision, summary, status }) => ({ id, subject, grievances, date, datePrecision, summary, status })),
      grievances,
      products: products
        .map((p) => ({
          id: p.id,
          name: p.name,
          category: p.category,
          facts: factsReaching(p.id),
          alternatives: p.alternatives
            .map((a) => data.products.find((x) => x.id === a))
            .filter((a) => !!a)
            .map((a) => ({ id: a.id, name: a.name, facts: factsReaching(a.id) }))
            .sort((a, b) => a.facts - b.facts || a.name.localeCompare(b.name)),
        }))
        .sort((a, b) => b.facts - a.facts || a.name.localeCompare(b.name)),
      categories: [...new Set(products.map((p) => p.category))],
    });
  }
  return groups.sort((a, b) => b.facts.length - a.facts.length || b.products.length - a.products.length || a.label.localeCompare(b.label));
}
