import { sankey, sankeyLinkHorizontal, type SankeyLink, type SankeyNode } from 'd3-sankey';
import type { ProductReport } from './report';
import type { Dataset } from './types';
import { GRIEVANCE_COLORS, GRIEVANCE_LABELS } from './labels';

const W = 1200;
const H = 630;
const PAD = 64;
const BG = '#14131c';
const FG = '#f3f2fa';
const SOFT = '#c9c8d8';
const MUTED = '#8e8ca3';
const ALERT = '#ff6b7d';
const MAX_TOOLS = 7;
const MAX_SOURCES = 5;

type N = { id: string; label: string; side: 'tool' | 'source'; facts: number; color: string };
type L = { source: string; target: string; value: number; color: string };

// The grievance palette is in oklch, which canvas accepts in current browsers.
const colorOf = (g?: string) => (g ? GRIEVANCE_COLORS[g] : ALERT);

/** A 1200×630 card: the headline, then a flow from the reader's tools to where their facts come from. */
export async function renderShareImage(data: Dataset, report: ProductReport[], siteUrl: string): Promise<Blob> {
  await document.fonts?.ready;
  const c = document.createElement('canvas');
  c.width = W * 2;
  c.height = H * 2;
  const g = c.getContext('2d')!;
  g.scale(2, 2); // sharp on high-density screens and once re-compressed by social networks
  const font = (w: number, s: number) => `${w} ${s}px "Geist Variable", system-ui, sans-serif`;

  g.fillStyle = BG;
  g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W * 0.78, 360, 20, W * 0.78, 360, 620);
  glow.addColorStop(0, 'rgba(255, 90, 110, 0.16)');
  glow.addColorStop(1, 'rgba(255, 90, 110, 0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);

  // Brand and date.
  g.textBaseline = 'alphabetic';
  g.fillStyle = FG;
  g.font = font(650, 24);
  g.fillText('Follow the Stack', PAD, 70);
  g.fillStyle = MUTED;
  g.font = font(400, 20);
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  g.textAlign = 'right';
  g.fillText(date, W - PAD, 70);
  g.textAlign = 'left';

  const flagged = report.filter((r) => r.facts.length);
  const used = flagged.length ? drawFlagged(g, font, data, report, flagged) : (drawClean(g, font, report), []);

  // Invitation: the reason the image exists.
  const cta = `What’s behind yours?  →  ${siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  g.font = font(600, 22);
  const cw = g.measureText(cta).width + 48;
  g.fillStyle = FG;
  g.beginPath();
  g.roundRect(W - PAD - cw, H - 84, cw, 48, 24);
  g.fill();
  g.fillStyle = BG;
  g.fillText(cta, W - PAD - cw + 24, H - 52);

  g.fillStyle = MUTED;
  g.font = font(400, 18);
  g.fillText('Every fact is sourced.', PAD, H - 54);

  // Legend under the headline: the grievances the colours stand for, as many as fit.
  g.font = font(400, 17);
  let x = PAD;
  for (const gr of used) {
    const w = 18 + g.measureText(GRIEVANCE_LABELS[gr]).width;
    if (x + w > W - PAD) break;
    g.fillStyle = colorOf(gr);
    g.beginPath();
    g.arc(x + 6, 206, 6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = MUTED;
    g.fillText(GRIEVANCE_LABELS[gr], x + 18, 212);
    x += w + 22;
  }

  return new Promise((res) => c.toBlob((b) => res(b!), 'image/png'));
}

/** Headline and flow; returns the grievances the colours stand for. */
function drawFlagged(g: CanvasRenderingContext2D, font: (w: number, s: number) => string, data: Dataset, report: ProductReport[], flagged: ProductReport[]): string[] {
  g.fillStyle = FG;
  g.font = font(700, 58);
  const head = `${flagged.length} of my ${report.length} tools`;
  g.fillText(head, PAD, 150);
  const hw = g.measureText(head).width;
  g.fillStyle = SOFT;
  g.font = font(400, 26);
  g.fillText('lead back to people or companies', PAD + hw + 28, 128);
  g.fillText('with documented facts.', PAD + hw + 28, 160);

  // Facts per source, and the grievance that dominates each source in this report.
  const facts = new Map<string, Set<string>>();
  const grievances = new Map<string, Map<string, number>>();
  const pair = new Map<string, number>();
  for (const r of flagged) {
    for (const { fact, entity } of r.facts) {
      facts.set(entity.id, (facts.get(entity.id) ?? new Set()).add(fact.id));
      const m = grievances.get(entity.id) ?? new Map<string, number>();
      for (const gr of fact.grievances) m.set(gr, (m.get(gr) ?? 0) + 1);
      grievances.set(entity.id, m);
      pair.set(`${r.product.id}|${entity.id}`, (pair.get(`${r.product.id}|${entity.id}`) ?? 0) + 1);
    }
  }
  const sources = [...facts.entries()].sort((a, b) => b[1].size - a[1].size);
  const keptSources = new Set(sources.slice(0, MAX_SOURCES).map(([id]) => id));
  const tools = [...flagged].sort((a, b) => b.facts.length - a.facts.length);
  const keptTools = new Set(tools.slice(0, MAX_TOOLS).map((r) => r.product.id));
  const dominant = (id: string) => [...(grievances.get(id) ?? new Map()).entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  const nodes: N[] = [];
  const toolNode = (id: string) => (keptTools.has(id) ? `t:${id}` : 't:__more');
  const sourceNode = (id: string) => (keptSources.has(id) ? `s:${id}` : 's:__more');
  for (const r of tools.slice(0, MAX_TOOLS)) nodes.push({ id: `t:${r.product.id}`, label: r.product.name, side: 'tool', facts: r.facts.length, color: MUTED });
  if (tools.length > MAX_TOOLS) nodes.push({ id: 't:__more', label: `${tools.length - MAX_TOOLS} more tools`, side: 'tool', facts: 0, color: MUTED });
  for (const [id, f] of sources.slice(0, MAX_SOURCES)) nodes.push({ id: `s:${id}`, label: data.entities[id]?.name ?? id, side: 'source', facts: f.size, color: colorOf(dominant(id)) });
  if (sources.length > MAX_SOURCES) {
    const rest = sources.slice(MAX_SOURCES).reduce((n, [, f]) => n + f.size, 0);
    nodes.push({ id: 's:__more', label: `${sources.length - MAX_SOURCES} others`, side: 'source', facts: rest, color: MUTED });
  }
  const merged = new Map<string, L>();
  for (const [k, value] of pair) {
    const [t, s] = k.split('|');
    const key = `${toolNode(t)}|${sourceNode(s)}`;
    const color = keptSources.has(s) ? colorOf(dominant(s)) : MUTED;
    const l = merged.get(key) ?? { source: toolNode(t), target: sourceNode(s), value: 0, color };
    l.value += value;
    merged.set(key, l);
  }

  // Tool labels on the left, source labels on the right, the flow in between.
  const left = PAD + 210;
  const right = W - PAD - 280;
  const top = 246;
  const bottom = H - 120;
  const layout = sankey<N, L>()
    .nodeId((n) => n.id)
    .nodeWidth(12)
    .nodePadding(18)
    .nodeSort((a, b) => (a.id.endsWith('__more') ? 1 : b.id.endsWith('__more') ? -1 : (b.value ?? 0) - (a.value ?? 0)))
    .extent([[left, top], [right, bottom]])({ nodes: nodes.map((n) => ({ ...n })), links: [...merged.values()].map((l) => ({ ...l })) });

  const path = sankeyLinkHorizontal<N, L>().context(g) as unknown as (l: SankeyLink<N, L>) => void;
  for (const l of layout.links) {
    const s = l.source as SankeyNode<N, L>;
    const t = l.target as SankeyNode<N, L>;
    const grad = g.createLinearGradient(s.x1 ?? 0, 0, t.x0 ?? 0, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.10)');
    grad.addColorStop(1, l.color);
    g.save();
    g.globalAlpha = 0.55;
    g.strokeStyle = grad;
    g.lineWidth = Math.max(2, l.width ?? 1);
    g.beginPath();
    path(l);
    g.stroke();
    g.restore();
  }
  g.textBaseline = 'middle';
  for (const n of layout.nodes) {
    const x0 = n.x0 ?? 0, x1 = n.x1 ?? 0, y0 = n.y0 ?? 0, y1 = n.y1 ?? 0;
    g.fillStyle = n.side === 'tool' ? SOFT : n.color;
    g.beginPath();
    g.roundRect(x0, y0, x1 - x0, Math.max(4, y1 - y0), 3);
    g.fill();
    const y = (y0 + y1) / 2;
    if (n.side === 'tool') {
      g.textAlign = 'right';
      g.fillStyle = n.id === 't:__more' ? MUTED : FG;
      g.font = font(500, 19);
      g.fillText(fit(g, n.label, 200), x0 - 12, y);
    } else {
      g.textAlign = 'left';
      g.fillStyle = n.id === 's:__more' ? MUTED : FG;
      g.font = font(600, 20);
      // A long name with a short form, such as "David Heinemeier Hansson (DHH)", keeps the short form.
      const short = n.label.match(/\((\S+)\)$/)?.[1];
      const name = g.measureText(n.label).width > 225 && short ? short : fit(g, n.label, 225);
      g.fillText(name, x1 + 12, y);
      const nameW = g.measureText(name).width;
      g.fillStyle = n.id === 's:__more' ? MUTED : n.color;
      g.font = font(500, 17);
      g.fillText(`${n.facts}`, x1 + 12 + nameW + 10, y);
    }
  }
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';

  return [...new Set(sources.slice(0, MAX_SOURCES).map(([id]) => dominant(id)).filter(Boolean))] as string[];
}

function drawClean(g: CanvasRenderingContext2D, font: (w: number, s: number) => string, report: ProductReport[]) {
  g.fillStyle = FG;
  g.font = font(700, 64);
  g.fillText('No documented facts', PAD, 210);
  g.fillText('behind my stack.', PAD, 286);
  g.font = font(500, 26);
  g.fillStyle = '#7fd1aa';
  g.fillText(`${report.length} tool${report.length === 1 ? '' : 's'} checked: nothing in the database, so far.`, PAD, 350);
  g.fillStyle = SOFT;
  g.font = font(400, 24);
  let line = '';
  let y = 420;
  for (const n of report.map((r) => r.product.name)) {
    const next = line ? `${line} · ${n}` : n;
    if (g.measureText(next).width > W - PAD * 2) {
      g.fillText(line, PAD, y);
      y += 36;
      line = n;
      if (y > 470) { line = '…'; break; }
    } else line = next;
  }
  if (line) g.fillText(line, PAD, y);
}

function fit(g: CanvasRenderingContext2D, text: string, max: number) {
  if (g.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && g.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}
