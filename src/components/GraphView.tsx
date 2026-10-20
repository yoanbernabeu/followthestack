import { useEffect, useMemo, useRef, useState } from 'react';
import type { Core, ElementDefinition, StylesheetStyle } from 'cytoscape';
import { Checkbox } from '@/components/ui/checkbox';
import type { Dataset } from '@/lib/types';
import { GRIEVANCE_COLORS, GRIEVANCE_LABELS, ROLE_LABELS } from '@/lib/labels';
import { url } from '@/lib/urls';
import { chainNodes, entityNode, fullGraph, induced, neighbourhood, productNode, type Graph, type GraphNode } from '@/lib/graph';

export type GraphViewProps = {
  base: string;
  view: 'global' | 'entity' | 'product' | 'stack';
  id?: string; // entity or product id, for the focused views
  productIds?: string[]; // for the stack view
  data?: Dataset; // reuse the dataset when the caller already has it
  indirect?: boolean;
  former?: boolean;
  height?: string;
};

const KIND_LABELS: Record<string, string> = {
  product: 'Product', company: 'Company', 'investment-fund': 'Investment fund', person: 'Person',
  foundation: 'Foundation', government: 'Government', project: 'Project',
};
// Mid-lightness hues that read on both light and dark backgrounds.
const KIND_COLORS: Record<string, string> = {
  product: 'oklch(0.72 0.02 260)', company: 'oklch(0.62 0.13 250)', 'investment-fund': 'oklch(0.66 0.14 75)',
  person: 'oklch(0.64 0.15 320)', foundation: 'oklch(0.64 0.12 165)', government: 'oklch(0.6 0.05 30)', project: 'oklch(0.66 0.1 200)',
};
const KIND_SHAPES: Record<string, string> = {
  product: 'round-rectangle', company: 'ellipse', 'investment-fund': 'diamond', person: 'ellipse',
  foundation: 'hexagon', government: 'octagon', project: 'hexagon',
};
const ROLE_GROUP: Record<string, 'control' | 'people' | 'money' | 'product'> = {
  'subsidiary-of': 'control', 'owned-by': 'control', 'led-by': 'people', 'founded-by': 'people',
  'board-member': 'people', 'invested-by': 'money', 'made-by': 'product',
};
const roleLabel = (r: string) => (r === 'made-by' ? 'made by' : ROLE_LABELS[r] ?? r);

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
const cssVar = (name: string) => toRgb(getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888');

function stylesheet(): StylesheetStyle[] {
  const fg = cssVar('--foreground');
  const muted = cssVar('--muted-foreground');
  const border = cssVar('--border');
  const bg = cssVar('--background');
  const alert = cssVar('--alert');
  const primary = cssVar('--primary');
  return [
    {
      selector: 'node',
      style: {
        label: 'data(label)', color: fg, 'font-size': 10, 'font-family': 'Geist Variable, sans-serif',
        'text-valign': 'bottom', 'text-margin-y': 3, 'text-wrap': 'ellipsis', 'text-max-width': '110px',
        'text-background-color': bg, 'text-background-opacity': 0.75, 'text-background-padding': '1px',
        'min-zoomed-font-size': 7, width: 'data(size)', height: 'data(size)',
        'background-color': 'data(color)', shape: 'data(shape)' as never, 'border-width': 0,
      },
    },
    { selector: 'node[facts > 0]', style: { 'border-width': 3, 'border-color': alert } },
    { selector: 'node.centre', style: { 'border-width': 4, 'border-color': fg, 'font-weight': 'bold' } },
    { selector: 'node:selected', style: { 'overlay-color': primary, 'overlay-opacity': 0.18, 'overlay-padding': 6 } },
    {
      selector: 'edge',
      style: {
        width: 1.2, 'line-color': muted, 'target-arrow-color': muted, 'target-arrow-shape': 'triangle',
        'arrow-scale': 0.7, 'curve-style': 'bezier', opacity: 0.7,
      },
    },
    { selector: 'edge[group = "control"]', style: { width: 2.4, 'line-color': fg, 'target-arrow-color': fg } },
    { selector: 'edge[group = "people"]', style: { 'line-color': primary, 'target-arrow-color': primary } },
    { selector: 'edge[group = "money"]', style: { 'line-style': 'dashed' } },
    { selector: 'edge[group = "product"]', style: { 'line-style': 'dotted', 'line-color': border, 'target-arrow-color': border, width: 1 } },
    { selector: 'edge[?former]', style: { opacity: 0.35, 'line-style': 'dashed' } },
    { selector: '.faded', style: { opacity: 0.12, 'text-opacity': 0 } },
    { selector: 'edge.lit', style: { opacity: 1, label: 'data(label)', 'font-size': 8, color: muted, 'text-rotation': 'autorotate', 'text-background-color': bg, 'text-background-opacity': 0.8 } },
  ];
}

function applyGrievance(cy: Core, grievance: string) {
  cy.elements().removeClass('faded lit');
  if (!grievance) return;
  const hits = cy.nodes().filter((n) => (n.data('grievances') as string[]).includes(grievance));
  cy.elements().addClass('faded');
  hits.removeClass('faded');
  hits.edgesWith(hits).removeClass('faded');
}

function elementsOf(g: Graph, centre?: string): ElementDefinition[] {
  return [
    ...g.nodes.map((n) => ({
      data: { ...n, size: Math.min(56, 16 + 6 * Math.sqrt(n.facts)), color: toRgb(KIND_COLORS[n.kind] ?? KIND_COLORS.company), shape: KIND_SHAPES[n.kind] ?? 'ellipse' },
      classes: n.id === centre ? 'centre' : undefined,
    })),
    ...g.edges.map((e) => ({ data: { ...e, group: ROLE_GROUP[e.role] ?? 'money', label: roleLabel(e.role) } })),
  ];
}

export default function GraphView({ base, view, id, productIds, data: given, indirect: indirectProp, former: formerProp, height }: GraphViewProps) {
  const [data, setData] = useState<Dataset | null>(given ?? null);
  const [error, setError] = useState(false);
  const [showProducts, setShowProducts] = useState(view !== 'global');
  const [indirectLocal, setIndirect] = useState(false);
  const [formerLocal, setFormer] = useState(false);
  const [grievance, setGrievance] = useState('');
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [extra, setExtra] = useState<string[]>([]); // nodes expanded by the reader in focused views
  const [query, setQuery] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const grievanceRef = useRef('');
  const indirect = indirectProp ?? indirectLocal;
  const former = formerProp ?? formerLocal;
  const centre = view === 'entity' && id ? entityNode(id) : view === 'product' && id ? productNode(id) : undefined;

  useEffect(() => {
    // A product focus in the full graph needs product nodes.
    if (view === 'global' && new URLSearchParams(location.search).get('focus')?.startsWith('p:')) setShowProducts(true);
  }, [view]);

  useEffect(() => {
    if (given) { setData(given); return; }
    fetch(`${base}data.json`).then((r) => r.json()).then(setData).catch(() => setError(true));
  }, [base, given]);

  const full = useMemo(() => (data ? fullGraph(data, { products: view !== 'global' || showProducts, former, indirect }) : null), [data, view, showProducts, former, indirect]);

  const graph = useMemo(() => {
    if (!data || !full) return null;
    if (view === 'global') {
      // Isolated nodes add noise to the overview; they stay reachable from their own pages.
      const linked = new Set(full.edges.flatMap((e) => [e.source, e.target]));
      return induced(full, linked);
    }
    let ids: Set<string>;
    if (view === 'stack') ids = chainNodes(data, productIds ?? [], indirect, former);
    else if (view === 'product') ids = chainNodes(data, id ? [id] : [], indirect, former);
    else ids = neighbourhood(full, centre ? [centre] : [], 2);
    for (const x of extra) neighbourhood(full, [x], 1).forEach((n) => ids.add(n));
    return induced(full, ids);
  }, [data, full, view, id, productIds, indirect, former, centre, extra]);

  // Create the Cytoscape instance once the graph is known; recreate when it changes.
  useEffect(() => {
    if (!graph || !box.current) return;
    let cancelled = false;
    (async () => {
      const [{ default: cytoscape }, { default: fcose }] = await Promise.all([import('cytoscape'), import('cytoscape-fcose')]);
      if (cancelled || !box.current) return;
      try { cytoscape.use(fcose); } catch { /* already registered */ }
      cyRef.current?.destroy();
      const small = graph.nodes.length < 60;
      const cy = cytoscape({
        container: box.current,
        elements: elementsOf(graph, centre),
        style: stylesheet(),
        minZoom: 0.05,
        maxZoom: 3,
        wheelSensitivity: 0.3,
        layout: view === 'product'
          ? { name: 'breadthfirst', directed: true, roots: centre ? [centre] : undefined, spacingFactor: 1.15, padding: 20 }
          : ({ name: 'fcose', quality: small ? 'proof' : 'default', animate: false, randomize: true, nodeRepulsion: 9000, idealEdgeLength: small ? 90 : 70, padding: 20 } as never),
      });
      cyRef.current = cy;
      const clear = () => { cy.elements().removeClass('faded lit'); setSelected(null); };
      cy.on('tap', 'node', (ev) => {
        const n = ev.target;
        const hood = n.closedNeighborhood();
        cy.elements().removeClass('lit').addClass('faded');
        hood.removeClass('faded');
        hood.edges().addClass('lit');
        setSelected(n.data() as GraphNode);
      });
      cy.on('tap', (ev) => { if (ev.target === cy) clear(); });
      cy.on('dbltap', 'node', (ev) => { location.href = ev.target.data('href'); });
      applyGrievance(cy, grievanceRef.current);
      const focus = view === 'global' ? new URLSearchParams(location.search).get('focus') : null;
      const start = focus ? cy.getElementById(focus) : null;
      if (start?.nonempty()) { cy.center(start); cy.zoom({ level: 1.2, position: start.position() }); start.emit('tap'); }
    })();
    return () => { cancelled = true; };
  }, [graph, view, centre]);

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

  const findNode = (label: string) => {
    const cy = cyRef.current;
    if (!cy) return;
    const n = cy.nodes().filter((x) => (x.data('label') as string).toLowerCase() === label.toLowerCase()).first();
    if (n.nonempty()) { cy.animate({ center: { eles: n }, zoom: 1.4 }, { duration: 300 }); n.emit('tap'); }
  };

  if (error) return <p className="text-sm text-muted-foreground">The graph could not be loaded.</p>;
  if (!graph) return <div className="animate-pulse rounded-lg border bg-muted/40" style={{ height: height ?? '420px' }} aria-hidden="true" />;
  const labels = graph.nodes.map((n) => n.label).sort((a, b) => a.localeCompare(b));
  const grievancesHere = [...new Set(graph.nodes.flatMap((n) => n.grievances))].sort();

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
        {view === 'global' && (
          <>
            <input
              list="graph-nodes" value={query} placeholder="Find a company, person or product…" aria-label="Find in the graph"
              className="h-9 w-full rounded-md border bg-background px-3 text-foreground sm:w-72"
              onChange={(e) => { setQuery(e.target.value); findNode(e.target.value); }}
            />
            <datalist id="graph-nodes">{labels.map((l) => <option key={l} value={l} />)}</datalist>
            <label className="flex items-center gap-2"><Checkbox checked={showProducts} onCheckedChange={(v) => setShowProducts(v === true)} />Products</label>
          </>
        )}
        {indirectProp === undefined && <label className="flex items-center gap-2"><Checkbox checked={indirectLocal} onCheckedChange={(v) => setIndirect(v === true)} />Minority investors</label>}
        {formerProp === undefined && <label className="flex items-center gap-2"><Checkbox checked={formerLocal} onCheckedChange={(v) => setFormer(v === true)} />Former links</label>}
        {grievancesHere.length > 0 && (
          <select value={grievance} onChange={(e) => setGrievance(e.target.value)} aria-label="Highlight a grievance" className="h-9 w-full rounded-md border bg-background px-2 text-foreground sm:w-auto">
            <option value="">All grievances</option>
            {grievancesHere.map((g) => <option key={g} value={g}>{GRIEVANCE_LABELS[g]}</option>)}
          </select>
        )}
        <span className="ml-auto text-xs">{graph.nodes.length} nodes · {graph.edges.length} links</span>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div
          ref={box} role="img" aria-label={`Relationship graph: ${graph.nodes.length} companies, people and products. The lists on this site contain the same information.`}
          className="w-full rounded-lg border bg-background" style={{ height: height ?? '420px' }}
        />
        <aside className="grid content-start gap-3 rounded-lg border p-4 text-sm">
          {selected ? (
            <>
              <div>
                <p className="text-xs text-muted-foreground">{KIND_LABELS[selected.kind] ?? selected.kind}</p>
                <p className="font-medium">{selected.label}</p>
              </div>
              <p className="text-muted-foreground">
                {selected.facts === 0 ? 'No documented fact.' : selected.kind === 'product'
                  ? `${selected.facts} documented fact${selected.facts > 1 ? 's' : ''} reach it.`
                  : `${selected.facts} documented fact${selected.facts > 1 ? 's' : ''}.`}
              </p>
              {selected.grievances.length > 0 && (
                <ul className="flex flex-wrap gap-1">
                  {selected.grievances.map((g) => (
                    <li key={g} className="rounded-full px-2 py-0.5 text-xs" style={{ background: `color-mix(in oklch, ${GRIEVANCE_COLORS[g]} 22%, transparent)` }}>{GRIEVANCE_LABELS[g]}</li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-3">
                <a className="font-medium underline" href={selected.href}>Open page</a>
                {view !== 'global' && <button type="button" className="underline" onClick={() => setExtra((x) => [...x, selected.id])}>Expand</button>}
                {view !== 'global' && <a className="underline" href={url.graph(selected.id)}>Full graph</a>}
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">Select a node to see its facts and links. Double-click opens its page.</p>
          )}
          <Legend />
        </aside>
      </div>
    </div>
  );
}

function Legend() {
  const kinds = ['product', 'company', 'investment-fund', 'person', 'foundation', 'project'];
  return (
    <div className="grid gap-2 border-t pt-3 text-xs text-muted-foreground">
      <ul className="grid grid-cols-2 gap-1">
        {kinds.map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <span className={`inline-block size-2.5 ${k === 'product' ? 'rounded-sm' : 'rounded-full'}`} style={{ background: KIND_COLORS[k] }} />{KIND_LABELS[k]}
          </li>
        ))}
      </ul>
      <p className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full border-2 border-alert" />Has documented facts</p>
      <ul className="grid gap-1">
        <li><span className="mr-1.5 inline-block w-5 border-t-2 border-foreground align-middle" />Owned by, subsidiary of</li>
        <li><span className="mr-1.5 inline-block w-5 border-t border-primary align-middle" />Led, founded, board</li>
        <li><span className="mr-1.5 inline-block w-5 border-t border-dashed border-muted-foreground align-middle" />Investor, or former link</li>
        <li><span className="mr-1.5 inline-block w-5 border-t border-dotted border-muted-foreground align-middle" />Product of</li>
      </ul>
    </div>
  );
}
