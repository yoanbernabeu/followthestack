import { useEffect, useMemo, useRef, useState } from 'react';
import { sankey, sankeyJustify, sankeyLinkHorizontal, type SankeyLink, type SankeyNode } from 'd3-sankey';
import type { Dataset } from '@/lib/types';
import { concentration, entityNode, productNode } from '@/lib/graph';
import { url } from '@/lib/urls';

type N = { id: string; label: string; kind: string; facts: number; href: string };
type L = { source: string; target: string; value: number };
type SN = SankeyNode<N, L>;
type SL = SankeyLink<N, L>;

export type FlowViewProps = {
  data?: Dataset; // passed by the analyzer; fetched from data.json on product pages
  base?: string;
  productIds: string[];
  indirect?: boolean;
  former?: boolean;
  scope: 'stack' | 'product';
  shared?: boolean; // a stack someone shared: "these tools" rather than "your tools"
};

const NODE_W = 10;
const ROW = 30; // vertical room per node in the busiest column

/**
 * Where the facts behind a set of tools come from, as a flow: tools on the left,
 * then vendors, owners and people. Band width is the number of facts carried.
 */
export default function FlowView({ data: given, base, ...rest }: FlowViewProps) {
  const [data, setData] = useState<Dataset | null>(given ?? null);
  useEffect(() => {
    if (given) { setData(given); return; }
    if (base) fetch(`${base}data.json`).then((r) => r.json()).then(setData).catch(() => {});
  }, [given, base]);
  if (!data) return <div className="h-56 animate-pulse rounded-lg bg-muted/40" aria-hidden="true" />;
  return <Flow data={data} {...rest} />;
}

function Flow({ data, productIds, indirect = false, former = false, scope, shared = false }: Omit<FlowViewProps, 'data' | 'base'> & { data: Dataset }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<string | null>(null); // a node id: highlight what flows through it

  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const model = useMemo(() => {
    const conc = concentration(data, productIds, { indirect, former });
    const own = new Map<string, number>();
    for (const f of data.facts) own.set(entityNode(f.subject), (own.get(entityNode(f.subject)) ?? 0) + 1);
    const links: L[] = [...conc.edgeFlow.entries()].map(([k, value]) => {
      const [source, target] = k.split('|');
      return { source, target, value };
    });
    const ids = new Set(links.flatMap((l) => [l.source, l.target]));
    const nodes: N[] = [...ids].map((id) => {
      const slug = id.slice(2);
      if (id.startsWith('p:')) {
        const p = data.products.find((x) => x.id === slug);
        return { id, label: p?.name ?? slug, kind: 'product', facts: conc.productFacts.get(id) ?? 0, href: url.product(slug) };
      }
      const e = data.entities[slug];
      return { id, label: e?.name ?? slug, kind: e?.type ?? 'company', facts: own.get(id) ?? 0, href: url.entity(slug) };
    });
    const clean = productIds.filter((id) => !(conc.productFacts.get(productNode(id)) ?? 0)).map((id) => data.products.find((p) => p.id === id)).filter(Boolean);
    return { nodes, links, clean };
  }, [data, productIds, indirect, former]);

  const layout = useMemo(() => {
    if (!width || !model.links.length) return null;
    const w = Math.max(width, 640);
    // Room for the longest label on each side (about 7px per character at 12px).
    const len = (n: N) => Math.min(24, n.label.length) + (n.kind !== 'product' && n.facts ? 9 : 0);
    const margin = {
      left: Math.min(170, 16 + 7 * Math.max(0, ...model.nodes.filter((n) => n.kind === 'product').map(len))),
      right: Math.min(300, 28 + 7.8 * Math.max(0, ...model.nodes.filter((n) => n.kind !== 'product').map(len))),
    };
    const build = (height: number) =>
      sankey<N, L>()
        .nodeId((n) => n.id)
        .nodeAlign(sankeyJustify)
        .nodeWidth(NODE_W)
        .nodePadding(14)
        .nodeSort((a, b) => (b.value ?? 0) - (a.value ?? 0))
        .extent([[margin.left, 8], [w - margin.right, height - 8]])({
          nodes: model.nodes.map((n) => ({ ...n })),
          links: model.links.map((l) => ({ ...l })),
        });
    try {
      // First pass to find the busiest column, second pass with room for its labels.
      const first = build(600);
      const perColumn = new Map<number, number>();
      for (const n of first.nodes) perColumn.set(n.depth ?? 0, (perColumn.get(n.depth ?? 0) ?? 0) + 1);
      const height = Math.max(scope === 'product' ? 150 : 200, Math.max(...perColumn.values()) * ROW + 16);
      const g = build(height);
      const maxDepth = Math.max(...g.nodes.map((n) => n.depth ?? 0));
      return { ...g, w, height, maxDepth };
    } catch {
      return null; // a cycle in the data: the text report below still holds everything
    }
  }, [model, width, scope]);

  const maxFacts = Math.max(1, ...model.nodes.filter((n) => n.kind !== 'product').map((n) => n.facts));
  const heat = (n: N) => (n.kind === 'product' || !n.facts ? 0 : Math.min(1, Math.log2(1 + n.facts) / Math.log2(1 + maxFacts)));

  // Everything upstream and downstream of the hovered node.
  const lit = useMemo(() => {
    if (!hover || !layout) return null;
    const keep = new Set<string>([hover]);
    const walk = (dir: 'sourceLinks' | 'targetLinks', id: string) => {
      const n = layout.nodes.find((x) => x.id === id);
      for (const l of (n?.[dir] ?? []) as SL[]) {
        const other = (dir === 'sourceLinks' ? l.target : l.source) as unknown as SN;
        if (!keep.has(other.id)) { keep.add(other.id); walk(dir, other.id); }
      }
    };
    walk('sourceLinks', hover);
    walk('targetLinks', hover);
    return keep;
  }, [hover, layout]);

  const tools = shared ? 'these tools' : 'your tools';
  const sources = model.nodes.filter((n) => n.kind !== 'product' && n.facts > 0).sort((a, b) => b.facts - a.facts);

  return (
    <div className="grid gap-4">
      {sources.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {scope === 'stack' ? `The facts behind ${tools} come from ` : 'Its facts come from '}
          {sources.slice(0, 4).map((s, i) => (
            <span key={s.id}>
              {i > 0 && (i === Math.min(4, sources.length) - 1 ? ' and ' : ', ')}
              <a className="font-medium text-foreground underline decoration-alert/50 underline-offset-4 hover:decoration-alert" href={s.href}>{s.label}</a> ({s.facts})
            </span>
          ))}
          {sources.length > 4 && <> and {sources.length - 4} more</>}. Wider bands carry more facts.
        </p>
      )}

      <div ref={box} className="overflow-x-auto">
        {!model.links.length ? (
          <p className="rounded-lg border p-4 text-sm text-muted-foreground">No documented fact reaches {scope === 'stack' ? 'these tools' : 'this product'}.</p>
        ) : !layout ? (
          <div className="h-56 animate-pulse rounded-lg bg-muted/40" aria-hidden="true" />
        ) : (
          <svg
            width={layout.w} height={layout.height} role="img" className="block"
            aria-label={`Flow of documented facts from ${sources.map((s) => s.label).join(', ')} to ${scope === 'stack' ? tools : 'this product'}. The list below contains the same information.`}
            onMouseLeave={() => setHover(null)}
          >
            <g fill="none">
              {(layout.links as SL[]).map((l, i) => {
                const s = l.source as SN;
                const t = l.target as SN;
                const on = !lit || (lit.has(s.id) && lit.has(t.id));
                return (
                  <path
                    key={i} d={sankeyLinkHorizontal()(l) ?? undefined} stroke="var(--alert)"
                    strokeWidth={Math.max(1.5, l.width ?? 1)} strokeOpacity={on ? (lit ? 0.5 : 0.22) : 0.05}
                    className="transition-[stroke-opacity] duration-150"
                  >
                    <title>{`${s.label} → ${t.label}: ${l.value} fact${l.value > 1 ? 's' : ''}`}</title>
                  </path>
                );
              })}
            </g>
            {(layout.nodes as SN[]).map((n) => {
              const x0 = n.x0 ?? 0, x1 = n.x1 ?? 0, y0 = n.y0 ?? 0, y1 = n.y1 ?? 0;
              const left = (n.depth ?? 0) === 0;
              const h = heat(n);
              const on = !lit || lit.has(n.id);
              return (
                <a key={n.id} href={n.href} onMouseEnter={() => setHover(n.id)} onFocus={() => setHover(n.id)} className="outline-none" style={{ opacity: on ? 1 : 0.25, transition: 'opacity 150ms' }}>
                  <rect
                    x={x0} y={y0} width={x1 - x0} height={Math.max(3, y1 - y0)} rx={2}
                    fill={n.kind === 'product' ? 'var(--muted-foreground)' : h ? `color-mix(in oklch, var(--alert) ${Math.round(45 + 55 * h)}%, var(--muted))` : 'var(--muted-foreground)'}
                  />
                  <text
                    x={left ? x0 - 8 : x1 + 8} y={(y0 + y1) / 2} dy="0.35em" textAnchor={left ? 'end' : 'start'}
                    className="fill-foreground text-[12px]"
                    // A halo in the card colour keeps labels readable where they cross the bands.
                    style={{ fontWeight: n.facts && n.kind !== 'product' ? 600 : 500, paintOrder: 'stroke', stroke: 'var(--card)', strokeWidth: 4, strokeLinejoin: 'round' }}
                  >
                    {n.label.length > 24 ? `${n.label.slice(0, 23)}…` : n.label}
                    {n.kind !== 'product' && n.facts > 0 && <tspan className="fill-alert" dx={6} style={{ fontWeight: 500 }}>{n.facts} fact{n.facts > 1 ? 's' : ''}</tspan>}
                  </text>
                  <title>{`${n.label}${n.facts ? ` · ${n.facts} fact${n.facts > 1 ? 's' : ''}${n.kind === 'product' ? ' reach it' : ''}` : ''}`}</title>
                </a>
              );
            })}
          </svg>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs text-muted-foreground">
        <span>{scope === 'stack' ? (shared ? 'The tools' : 'Your tools') : 'The product'} on the left, the companies and people the facts come from on the right. Hover to follow a path, click to open a page.</span>
        {scope === 'stack' && model.clean.length > 0 && (
          <span>No documented fact behind: {model.clean.map((p) => p!.name).join(', ')}</span>
        )}
      </div>
    </div>
  );
}
