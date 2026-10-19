import type { ProductReport } from './report';
import type { Dataset } from './types';
import { GRIEVANCE_COLORS, GRIEVANCE_LABELS } from './labels';

const W = 1200;
const H = 630;

// Draws a 1200x630 card summarising the report, entirely in the browser.
export async function renderShareImage(data: Dataset, report: ProductReport[], siteUrl: string): Promise<Blob> {
  await document.fonts?.ready;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const font = (w: number, s: number) => `${w} ${s}px "Geist Variable", system-ui, sans-serif`;

  g.fillStyle = '#16151f';
  g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W / 2, -80, 40, W / 2, -80, 700);
  glow.addColorStop(0, 'rgba(140, 132, 255, 0.28)');
  glow.addColorStop(1, 'rgba(140, 132, 255, 0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);

  const flagged = report.filter((r) => r.facts.length);
  const pad = 72;
  g.fillStyle = '#a9a6ff';
  g.font = font(600, 26);
  g.fillText('Follow the Stack', pad, 92);
  g.fillStyle = '#9b9ab0';
  g.font = font(400, 22);
  g.fillText(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }), pad, 126);

  g.fillStyle = '#f1f0f8';
  if (flagged.length) {
    g.font = font(600, 64);
    g.fillText(`${flagged.length} of my ${report.length} tools`, pad, 236);
    g.font = font(400, 40);
    g.fillStyle = '#c9c8d8';
    g.fillText('lead back to people or companies with documented facts.', pad, 296);

    // Grievance bar, each fact counted once per grievance.
    const seen = new Set<string>();
    const counts = new Map<string, number>();
    for (const r of flagged) for (const { fact } of r.facts) {
      if (seen.has(fact.id)) continue;
      seen.add(fact.id);
      for (const gr of fact.grievances) counts.set(gr, (counts.get(gr) ?? 0) + 1);
    }
    const parts = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const total = parts.reduce((a, [, n]) => a + n, 0);
    let x = pad;
    const bw = W - pad * 2;
    g.save();
    g.beginPath();
    g.roundRect(pad, 340, bw, 22, 11);
    g.clip();
    for (const [gr, n] of parts) {
      const w = (n / total) * bw;
      g.fillStyle = GRIEVANCE_COLORS[gr];
      g.fillRect(x, 340, w, 22);
      x += w;
    }
    g.restore();
    g.font = font(400, 22);
    let lx = pad;
    for (const [gr, n] of parts.slice(0, 4)) {
      const label = `${GRIEVANCE_LABELS[gr]} ${Math.round((n / total) * 100)}%`;
      g.fillStyle = GRIEVANCE_COLORS[gr];
      g.beginPath();
      g.arc(lx + 7, 398, 7, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#c9c8d8';
      g.fillText(label, lx + 22, 406);
      lx += 30 + g.measureText(label).width + 26;
      if (lx > W - pad - 200) break;
    }

    const byEntity = new Map<string, Set<string>>();
    for (const r of flagged) for (const f of r.facts) byEntity.set(f.entity.id, (byEntity.get(f.entity.id) ?? new Set()).add(f.fact.id));
    const top = [...byEntity.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, 3);
    g.font = font(400, 28);
    g.fillStyle = '#f1f0f8';
    g.fillText(`Most of them come from ${top.map(([id, f]) => `${data.entities[id]?.name} (${f.size})`).join(', ')}.`, pad, 480, W - pad * 2);
  } else {
    g.font = font(600, 64);
    g.fillText('No documented facts', pad, 236);
    g.fillText('behind my stack.', pad, 312);
    g.font = font(400, 26);
    g.fillStyle = '#7fd1aa';
    g.fillText(`${report.length} tool${report.length === 1 ? '' : 's'} checked: nothing in the database, so far.`, pad, 372);
    g.fillStyle = '#c9c8d8';
    g.font = font(400, 24);
    const names = report.map((r) => r.product.name);
    let line = '';
    let y = 440;
    for (const n of names) {
      const next = line ? `${line} · ${n}` : n;
      if (g.measureText(next).width > W - pad * 2) {
        g.fillText(line, pad, y);
        y += 36;
        line = n;
        if (y > 520) { line = '…'; break; }
      } else line = next;
    }
    if (line) g.fillText(line, pad, y);
  }

  g.fillStyle = '#9b9ab0';
  g.font = font(400, 22);
  g.fillText(`Check yours: ${siteUrl.replace(/^https?:\/\//, '')}`, pad, H - 56);

  return new Promise((res) => c.toBlob((b) => res(b!), 'image/png'));
}
