import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { GRIEVANCE_COLORS } from './labels';

const require = createRequire(import.meta.url);
const font = (w: number) => readFileSync(require.resolve(`@fontsource/geist-sans/files/geist-sans-latin-${w}-normal.woff`));
const fonts = [
  { name: 'Geist', data: font(400), weight: 400 as const, style: 'normal' as const },
  { name: 'Geist', data: font(600), weight: 600 as const, style: 'normal' as const },
];

// resvg does not understand oklch(): convert the grievance palette to hex.
function oklchToHex(css: string): string {
  const m = css.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
  if (!m) return css;
  const [L, C, H] = m.slice(1).map(Number);
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
  ];
  return '#' + lin.map((v) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0');
  }).join('');
}

type Node = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, children?: unknown): Node => ({ type, props: { style, children } });
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export type OgCard = {
  kicker: string;
  title: string;
  subtitle?: string;
  // Grievance counts for the colour bar, if any.
  bar?: [string, number][];
};

export async function renderOg({ kicker, title, subtitle, bar }: OgCard): Promise<Buffer> {
  const total = bar?.reduce((a, [, n]) => a + n, 0) ?? 0;
  const tree = h('div', {
    width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: '64px 72px 56px', boxSizing: 'border-box',
    backgroundColor: '#16151f', borderTop: '10px solid #8c84ff',
    fontFamily: 'Geist', color: '#f1f0f8',
  }, [
    h('div', { display: 'flex', fontSize: 26, fontWeight: 600, color: '#a9a6ff' }, 'Follow the Stack'),
    h('div', { display: 'flex', marginTop: 70, fontSize: 26, color: '#9b9ab0', textTransform: 'uppercase', letterSpacing: 2 }, kicker),
    h('div', { display: 'flex', marginTop: 14, fontSize: title.length > 28 ? 64 : 84, fontWeight: 600, lineHeight: 1.05 }, clip(title, 60)),
    subtitle ? h('div', { display: 'flex', marginTop: 24, fontSize: 32, color: '#c9c8d8', lineHeight: 1.35 }, clip(subtitle, 140)) : null,
    h('div', { display: 'flex', flexGrow: 1 }),
    total ? h('div', { display: 'flex', width: '100%', height: 20, borderRadius: 10, overflow: 'hidden', marginBottom: 28 },
      bar!.map(([g, n]) => h('div', { display: 'flex', width: `${(n / total) * 100}%`, height: '100%', backgroundColor: oklchToHex(GRIEVANCE_COLORS[g]) }))) : null,
    h('div', { display: 'flex', fontSize: 24, color: '#9b9ab0' }, 'Who is behind your tech stack, with sources.'),
  ].filter(Boolean));
  const svg = await satori(tree as never, { width: 1200, height: 630, fonts });
  return new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
}

export const png = (buf: Buffer) => new Response(new Uint8Array(buf), { headers: { 'Content-Type': 'image/png' } });

export function countGrievances(facts: { id: string; grievances: string[] }[]): [string, number][] {
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const f of facts) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    for (const g of f.grievances) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}
