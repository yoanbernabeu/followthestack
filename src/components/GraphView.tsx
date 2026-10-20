import { useEffect, useMemo, useRef, useState } from 'react';
import type { Core, ElementDefinition, StylesheetStyle } from 'cytoscape';
import { Maximize2, Minus, Plus } from 'lucide-react';
import type { Dataset } from '@/lib/types';
import { GRIEVANCE_COLORS, GRIEVANCE_LABELS, ROLE_LABELS } from '@/lib/labels';
import { concentration, entityNode, fullGraph, induced, neighbourhood, type Concentration, type Graph, type GraphNode } from '@/lib/graph';

export type GraphViewProps = {
  base: string;
  id: string; // the entity at the centre
  height?: string;
};

const KIND_LABELS: Record<string, string> = {
  product: 'Product', company: 'Company', 'investment-fund': 'Investment fund', person: 'Person',
  foundation: 'Foundation', government: 'Government', project: 'Project',
};
// When two nodes are linked several times (founded by, led by…), one edge carries the strongest role.
const ROLE_RANK = ['subsidiary-of', 'owned-by', 'led-by', 'founded-by', 'board-member', 'invested-by', 'made-by'];
const ROLE_GROUP: Record<string, 'control' | 'people' | 'money' | 'product'> = {
  'subsidiary-of': 'control', 'owned-by': 'control', 'led-by': 'people', 'founded-by': 'people',
  'board-member': 'people', 'invested-by': 'money', 'made-by': 'product',
};
const roleLabel = (r: string) => (r === 'made-by' ? 'product of' : ROLE_LABELS[r] ?? r);

// Cytoscape does not parse oklch(), so resolve any CSS colour to rgb through a canvas.
function toRgb(color: string): string {
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return '#888';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgb(${r},${g},${b})`;
}
const mix = (a: string, b: string, t: number) => {
  const [x, y] = [a, b].map((c) => c.match(/\d+/g)!.map(Number));
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`;
};
const cssVar = (name: string) => toRgb(getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888');

/** Labelled pills, red for the entities carrying facts. */
function stylesheet(): StylesheetStyle[] {
  const fg = cssVar('--foreground');
  const muted = cssVar('--muted-foreground');
  const surface = cssVar('--card');
  const subtle = cssVar('--muted');
  const line = cssVar('--border');
  const bg = cssVar('--background');
  const alert = cssVar('--alert');
  const alertSoft = cssVar('--alert-soft');
  const font = 'Geist Variable, ui-sans-serif, sans-serif';
  // Cast: the typings lag behind Cytoscape (corner-radius, overlay-shape…).
  const nodes = ([
        {
          selector: 'node',
          style: {
            shape: 'round-rectangle', 'corner-radius': 6, width: 'label', height: 30, padding: '12px',
            'background-color': surface, 'border-width': 1, 'border-color': line, label: 'data(label)',
            'font-family': font, 'font-size': 12, 'font-weight': 500, color: fg, 'text-valign': 'center', 'text-halign': 'center',
            'text-wrap': 'ellipsis', 'text-max-width': '160px',
          },
        },
        { selector: 'node[kind = "person"]', style: { 'corner-radius': 15 } },
        { selector: 'node[kind = "product"]', style: { 'background-color': subtle, 'border-style': 'dashed', color: muted } },
        {
          selector: 'node[?own]',
          style: {
            'background-color': `mapData(heat, 0, 1, ${alertSoft}, ${mix(alertSoft, alert, 0.75)})`,
            'border-color': alert, 'border-width': 'mapData(heat, 0, 1, 1, 3)', 'font-size': 'data(fs)', height: 'data(h)', color: fg,
          },
        },
        { selector: 'node.centre', style: { 'border-width': 2.5, 'border-color': fg, 'font-weight': 700 } },
      ]) as unknown as StylesheetStyle[];
  return [
    ...nodes,
    { selector: 'node:selected', style: { 'overlay-color': fg, 'overlay-opacity': 0.08, 'overlay-padding': 6, 'overlay-shape': 'round-rectangle' } },
    {
      selector: 'edge',
      style: {
        'curve-style': 'straight',
        width: 1, 'line-color': muted, opacity: 0.55,
        'target-arrow-shape': 'triangle', 'target-arrow-color': muted, 'arrow-scale': 0.6,
      },
    },
    { selector: 'edge[group = "control"]', style: { width: 1.8, opacity: 0.85 } },
    { selector: 'edge[group = "money"]', style: { 'line-style': 'dashed', 'line-dash-pattern': [4, 4] } },
    { selector: 'edge[group = "product"]', style: { 'line-style': 'dotted', 'line-color': line, 'target-arrow-color': line } },
    { selector: 'edge[?former]', style: { 'line-style': 'dashed', opacity: 0.25 } },
    { selector: 'edge[flow = 0]', style: { opacity: 0.35 } },
    { selector: 'edge[flow > 0]', style: { 'line-color': alert, 'target-arrow-color': alert, width: 'data(w)', opacity: 0.85, 'line-style': 'solid' } },
    { selector: '.faded', style: { opacity: 0.1, 'text-opacity': 0.15 } },
    {
      selector: 'edge.lit',
      style: {
        opacity: 0.9, label: 'data(label)', 'font-family': font, 'font-size': 10, color: muted,
        'text-rotation': 'autorotate', 'text-background-color': bg, 'text-background-opacity': 1, 'text-background-padding': '2px',
      },
    },
  ] as unknown as StylesheetStyle[];
}

function applyGrievance(cy: Core, grievance: string) {
  cy.elements().removeClass('faded lit');
  if (!grievance) return;
  const hits = cy.nodes().filter((n) => (n.data('grievances') as string[]).includes(grievance));
  cy.elements().addClass('faded');
  hits.removeClass('faded').addClass('lit');
  hits.edgesWith(hits).removeClass('faded');
}

function elementsOf(g: Graph, conc: Concentration, centre?: string): ElementDefinition[] {
  // One edge per pair of nodes, labelled with every role between them.
  const pairs = new Map<string, { source: string; target: string; roles: string[]; former: boolean }>();
  for (const e of g.edges) {
    const key = `${e.source}|${e.target}`;
    const p = pairs.get(key) ?? { source: e.source, target: e.target, roles: [], former: true };
    p.roles.push(e.role);
    p.former = p.former && e.former;
    pairs.set(key, p);
  }
  const maxFacts = Math.max(1, ...g.nodes.filter((n) => n.kind !== 'product').map((n) => n.facts));
  return [
    ...g.nodes.map((n) => {
      const own = n.kind !== 'product' && n.facts > 0;
      const reach = conc.reach.get(n.id)?.size ?? 0;
      // Weight: facts carried times products reached.
      const weight = own ? n.facts * Math.max(1, reach) : 0;
      const heat = own ? Math.min(1, Math.log2(1 + n.facts) / Math.log2(1 + maxFacts)) : 0;
      return {
        data: {
          ...n, own, reach, weight, heat,
          fs: Math.round(Math.min(17, 12 + 1.1 * Math.log2(1 + weight))), h: Math.round(Math.min(46, 30 + 2 * Math.log2(1 + weight))),
        },
        classes: n.id === centre ? 'centre' : undefined,
      };
    }),
    ...[...pairs.entries()].map(([key, p]) => {
      const roles = [...new Set(p.roles)].sort((a, b) => ROLE_RANK.indexOf(a) - ROLE_RANK.indexOf(b));
      const flow = conc.edgeFlow.get(key) ?? 0;
      return { data: { id: key, source: p.source, target: p.target, former: p.former, group: ROLE_GROUP[roles[0]] ?? 'money', label: roles.map(roleLabel).join(' · '), flow, w: flow ? Math.min(9, 1.2 + 1.3 * Math.sqrt(flow)) : 1 } };
    }),
  ];
}

export default function GraphView({ base, id, height }: GraphViewProps) {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState(false);
  const [indirect, setIndirect] = useState(false);
  const [former, setFormer] = useState(false);
  const [grievance, setGrievance] = useState('');
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [extra, setExtra] = useState<string[]>([]); // nodes expanded by the reader
  const box = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const grievanceRef = useRef('');
  const centre = entityNode(id);

  useEffect(() => {
    fetch(`${base}data.json`).then((r) => r.json()).then(setData).catch(() => setError(true));
  }, [base]);

  const full = useMemo(() => (data ? fullGraph(data, { products: true, former, indirect }) : null), [data, former, indirect]);

  // Facts flowing towards every product, to draw the links they travel along.
  const conc = useMemo(() => (data ? concentration(data, data.products.map((p) => p.id), { indirect, former }) : null), [data, indirect, former]);

  const graph = useMemo(() => {
    if (!full) return null;
    const ids = neighbourhood(full, [centre], 2, 40);
    for (const x of extra) neighbourhood(full, [x], 1).forEach((n) => ids.add(n));
    return induced(full, ids);
  }, [full, centre, extra]);

  // Create the Cytoscape instance once the graph is known; recreate when it changes.
  useEffect(() => {
    if (!graph || !conc || !box.current) return;
    let cancelled = false;
    (async () => {
      const [{ default: cytoscape }, { default: fcose }] = await Promise.all([import('cytoscape'), import('cytoscape-fcose')]);
      if (cancelled || !box.current) return;
      try { cytoscape.use(fcose); } catch { /* already registered */ }
      cyRef.current?.destroy();
      const cy = cytoscape({
        container: box.current,
        elements: elementsOf(graph, conc, centre),
        style: stylesheet(),
        minZoom: 0.1,
        maxZoom: 2.5,
        wheelSensitivity: 0.25,
        boxSelectionEnabled: false,
        layout: {
          name: 'fcose', quality: 'proof', animate: false, randomize: true, padding: 24, nodeDimensionsIncludeLabels: true,
          nodeRepulsion: 12000, idealEdgeLength: 110, gravity: 0.25, nodeSeparation: 80,
        } as never,
      });
      cyRef.current = cy;
      const clear = () => { cy.elements().removeClass('faded lit'); applyGrievance(cy, grievanceRef.current); setSelected(null); };
      cy.on('tap', 'node', (ev) => {
        const hood = ev.target.closedNeighborhood();
        cy.elements().removeClass('lit').addClass('faded');
        hood.removeClass('faded').addClass('lit');
        setSelected(ev.target.data() as GraphNode);
      });
      cy.on('tap', (ev) => { if (ev.target === cy) clear(); });
      cy.on('dbltap', 'node', (ev) => { location.href = ev.target.data('href'); });
      cy.on('mouseover', 'node', () => { box.current?.style.setProperty('cursor', 'pointer'); });
      cy.on('mouseout', 'node', () => { box.current?.style.removeProperty('cursor'); });
      applyGrievance(cy, grievanceRef.current);
    })();
    return () => { cancelled = true; };
  }, [graph, conc, centre]);

  useEffect(() => () => { cyRef.current?.destroy(); cyRef.current = null; }, []);

  // Restyle when the site switches between light and dark.
  useEffect(() => {
    const obs = new MutationObserver(() => cyRef.current?.style(stylesheet()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  // Grievance filter: keep the nodes concerned and what links them.
  useEffect(() => {
    grievanceRef.current = grievance;
    if (cyRef.current) applyGrievance(cyRef.current, grievance);
  }, [grievance]);

  const zoomBy = (f: number) => {
    const cy = cyRef.current;
    if (cy) cy.animate({ zoom: { level: cy.zoom() * f, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } } }, { duration: 150 });
  };

  if (error) return <p className="text-sm text-muted-foreground">The graph could not be loaded.</p>;
  const h = height ?? '440px';
  if (!graph) return <div className="animate-pulse rounded-xl border bg-muted/40" style={{ height: h }} aria-hidden="true" />;
  const grievancesHere = [...new Set(graph.nodes.flatMap((n) => n.grievances))].sort();
  const chip = (on: boolean) => `h-8 rounded-full border px-3 text-xs transition-colors ${on ? 'border-foreground bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={chip(indirect)} aria-pressed={indirect} onClick={() => setIndirect((v) => !v)}>Investors</button>
        <button type="button" className={chip(former)} aria-pressed={former} onClick={() => setFormer((v) => !v)}>Former links</button>
        {grievancesHere.length > 0 && (
          <select value={grievance} onChange={(e) => setGrievance(e.target.value)} aria-label="Highlight a grievance" className="h-8 w-full rounded-full border bg-background px-3 text-xs sm:w-auto">
            <option value="">All grievances</option>
            {grievancesHere.map((g) => <option key={g} value={g}>{GRIEVANCE_LABELS[g]}</option>)}
          </select>
        )}
      </div>

      <div className="relative overflow-hidden rounded-xl border bg-[radial-gradient(var(--border)_1px,transparent_1px)] [background-size:18px_18px]" style={{ height: h }}>
        <div ref={box} role="img" className="h-full w-full" aria-label={`Relationship graph: ${graph.nodes.length} companies, people and products. The lists on this page contain the same information.`} />

        <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-background/80 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur">
          {graph.nodes.length} nodes · {graph.edges.length} links
        </span>

        <div className="absolute right-3 bottom-3 flex overflow-hidden rounded-full border bg-background/90 shadow-sm backdrop-blur">
          <button type="button" aria-label="Zoom in" className="p-2 hover:bg-muted" onClick={() => zoomBy(1.3)}><Plus className="size-4" /></button>
          <button type="button" aria-label="Zoom out" className="border-x p-2 hover:bg-muted" onClick={() => zoomBy(1 / 1.3)}><Minus className="size-4" /></button>
          <button type="button" aria-label="Fit to screen" className="p-2 hover:bg-muted" onClick={() => cyRef.current?.animate({ fit: { eles: cyRef.current.elements(), padding: 24 } }, { duration: 200 })}><Maximize2 className="size-4" /></button>
        </div>

        {selected && (
          <aside className="absolute top-3 right-3 grid w-[min(18rem,calc(100%-1.5rem))] gap-3 rounded-xl border bg-background/95 p-4 text-sm shadow-lg backdrop-blur">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{KIND_LABELS[selected.kind] ?? selected.kind}</p>
                <p className="truncate text-base font-semibold">{selected.label}</p>
              </div>
              <button type="button" aria-label="Close" className="-mt-1 -mr-1 rounded-full px-2 text-lg leading-none text-muted-foreground hover:text-foreground" onClick={() => cyRef.current?.emit('tap')}>×</button>
            </div>
            <p className={selected.facts ? 'text-alert' : 'text-muted-foreground'}>
              {selected.facts === 0 ? 'No documented fact' : `${selected.facts} documented fact${selected.facts > 1 ? 's' : ''}${selected.kind === 'product' ? ' reach it' : ''}`}
            </p>
            {selected.grievances.length > 0 && (
              <ul className="flex flex-wrap gap-1">
                {selected.grievances.map((g) => (
                  <li key={g} className="rounded-full px-2 py-0.5 text-xs" style={{ background: `color-mix(in oklch, ${GRIEVANCE_COLORS[g]} 20%, transparent)` }}>{GRIEVANCE_LABELS[g]}</li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <a className="inline-flex h-8 items-center rounded-full bg-foreground px-3 text-xs font-medium text-background" href={selected.href}>Open page</a>
              <button type="button" className="h-8 rounded-full border px-3 text-xs hover:bg-muted" onClick={() => setExtra((x) => [...x, selected.id])}>Expand</button>
            </div>
          </aside>
        )}
      </div>

      <Legend />
    </div>
  );
}

function Legend() {
  const item = 'flex items-center gap-1.5';
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
      <li className={item}><span className="h-3 w-5 rounded-sm border border-alert bg-alert-soft" />Documented facts</li>
      <li className={item}><span className="h-3 w-5 rounded-sm border bg-card" />Company, fund, person</li>
      <li className={item}><span className="h-3 w-5 rounded-sm border border-dashed bg-muted" />Product</li>
      <li className={item}><span className="w-5 border-t-[3px] border-alert" />Facts flowing to products (thicker = more)</li>
      <li className={item}><span className="w-5 border-t-2 border-muted-foreground/80" />Owned by, subsidiary of</li>
      <li className={item}><span className="w-5 border-t border-muted-foreground/60" />Led, founded, board</li>
      <li className={item}><span className="w-5 border-t border-dashed border-muted-foreground/60" />Investor, former link</li>
      <li className="ml-auto hidden sm:block">Click a node for details · double-click to open its page</li>
    </ul>
  );
}
