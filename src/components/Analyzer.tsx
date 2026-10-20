import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link2, Download, ChevronDown, Check, ArrowRight, Image as ImageIcon } from 'lucide-react';
import { renderShareImage } from '@/lib/shareImage';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import type { Dataset } from '@/lib/types';
import { GRIEVANCE_COLORS, GRIEVANCE_LABELS, LINK_LABELS, ROLE_LABELS, formatDate } from '@/lib/labels';
import { url } from '@/lib/urls';
import { REPO_URL } from '@/lib/repo';
import { buildReport, type ProductReport } from '@/lib/report';
import FlowView from '@/components/FlowView';
import StackBuilder, { SOURCE_LABELS, type Project } from '@/components/StackBuilder';

const MANUAL = '__manual__';

type Origin = { label: string; detail?: string };
// Where each product of the report comes from: manual pick, pasted file, imported files or scanned folder.
function provenanceOf(manual: Set<string>, projects: Project[]) {
  const map = new Map<string, Origin[]>();
  const add = (id: string, o: Origin) => map.set(id, [...(map.get(id) ?? []), o]);
  for (const id of manual) add(id, { label: 'Picked by hand' });
  for (const p of projects)
    for (const id of p.productIds) add(id, { label: `${SOURCE_LABELS[p.source]} “${p.name}”`, detail: p.matches[id]?.join(', ') });
  return map;
}

function Provenance({ origins }: { origins?: Origin[] }) {
  if (!origins?.length) return null;
  return (
    <span className="text-xs text-muted-foreground">
      Found in: {origins.map((o, i) => (
        <span key={i}>{i > 0 && ' · '}{o.label}{o.detail && <code className="ml-1 rounded bg-muted px-1">{o.detail}</code>}</span>
      ))}
    </span>
  );
}
// URL-safe base64 of UTF-8 text, used to encode the stack in the share link (#stack=...).
const b64 = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));

/** The stack picker and its report; `shared` shows a report received by link, read-only, with an invitation to check one's own stack. */
export default function Analyzer({ base, shared = false }: { base: string; shared?: boolean }) {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [manual, setManual] = useState<Set<string>>(new Set());
  const [scope, setScope] = useState('all');
  const [indirect, setIndirect] = useState(false);
  const [former, setFormer] = useState(false);

  useEffect(() => {
    fetch(`${base}data.json`).then((r) => r.json()).then(setData).catch(() => setError(true));
    try {
      const m = location.hash.match(/stack=([\w-]+)/);
      if (m) {
        const s = JSON.parse(unb64(m[1]));
        setManual(new Set(s.m ?? []));
        setProjects((s.p ?? []).map((p: { n: string; i: string[] }, k: number) => ({ id: `p${k}`, name: p.n, source: 'link', files: [], productIds: p.i, matches: {} })));
      }
    } catch { /* ignore malformed links */ }
  }, [base]);

  const code = useMemo(
    () => (manual.size || projects.length ? b64(JSON.stringify({ m: [...manual], p: projects.map((p) => ({ n: p.name, i: p.productIds })) })) : ''),
    [manual, projects],
  );
  useEffect(() => {
    if (shared) return; // a shared report keeps the link it was opened with
    history.replaceState(null, '', code ? `#stack=${code}` : location.pathname);
  }, [code, shared]);

  const allIds = useMemo(() => {
    if (scope === MANUAL) return [...manual];
    if (scope !== 'all') return projects.find((p) => p.id === scope)?.productIds ?? [];
    return [...manual, ...projects.flatMap((p) => p.productIds)];
  }, [scope, manual, projects]);

  const report = useMemo(() => (data ? buildReport(data, allIds, indirect, former) : []), [data, allIds, indirect, former]);
  // Products with at least one direct documented fact, to flag them in the picker.
  const flagged = useMemo(
    () => new Set(data ? buildReport(data, data.products.map((p) => p.id)).filter((r) => r.facts.length).map((r) => r.product.id) : []),
    [data],
  );

  if (error) return <p className="py-12 text-center text-destructive">Could not load the database. Reload the page.</p>;
  if (!data) return <p className="py-12 text-center text-muted-foreground">Loading the database…</p>;

  const totalIds = new Set([...manual, ...projects.flatMap((p) => p.productIds)]);
  const hasStack = totalIds.size > 0 || projects.length > 0;

  const reportProps = { data, report, provenance: provenanceOf(manual, projects), projects, manualCount: manual.size, scope, setScope, indirect, setIndirect, former, setFormer, shareUrl: `${location.origin}${base}report/#stack=${code}`, shared };
  const invite = (
    <a href={`${base}#start`} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
      Check your own stack <ArrowRight className="size-4" />
    </a>
  );

  if (shared) {
    return (
      <div className="grid gap-8">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-primary/30 bg-primary/10 p-5">
          <div className="grid gap-1">
            <p className="text-lg font-semibold">{hasStack ? 'Someone shared what’s behind their stack.' : 'This link holds no stack.'}</p>
            <p className="text-sm text-muted-foreground">What about the tools you use? Pick them in a minute; nothing leaves your browser.</p>
          </div>
          {invite}
        </div>
        {hasStack && <Report {...reportProps} />}
        {hasStack && (
          <div className="grid justify-items-center gap-3 rounded-xl border p-8 text-center">
            <p className="text-2xl font-semibold tracking-tight">What’s behind yours?</p>
            <p className="max-w-md text-sm text-muted-foreground">Every fact is sourced. Free and open source, no account.</p>
            {invite}
          </div>
        )}
        {hasStack && <StarCard />}
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      <Card>
        <CardHeader>
          <CardTitle>Which tools does your team use?</CardTitle>
          <CardDescription>Search or click. You can change your selection at any time.</CardDescription>
        </CardHeader>
        <CardContent>
          <StackBuilder data={data} flagged={flagged} manual={manual} setManual={setManual} projects={projects} setProjects={setProjects} />
        </CardContent>
      </Card>

      {hasStack && <Report {...reportProps} />}
      {hasStack && <StarCard />}
    </div>
  );
}

function Report({ data, report, provenance, projects, manualCount, scope, setScope, indirect, setIndirect, former, setFormer, shareUrl, shared }: {
  data: Dataset; report: ProductReport[]; provenance: Map<string, Origin[]>; projects: Project[]; manualCount: number;
  scope: string; setScope: (s: string) => void; indirect: boolean; setIndirect: (v: boolean) => void;
  former: boolean; setFormer: (v: boolean) => void; shareUrl: string; shared: boolean;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const flagged = report.filter((r) => r.facts.length);
  const clean = report.filter((r) => !r.facts.length);

  // Plain-language summary: how many tools, and the names that come up most.
  const byEntity = new Map<string, Set<string>>();
  for (const r of flagged) for (const f of r.facts) byEntity.set(f.entity.id, (byEntity.get(f.entity.id) ?? new Set()).add(f.fact.id));
  const top = [...byEntity.entries()].sort((a, b) => b[1].size - a[1].size).slice(0, 3);

  // Which button just worked, to confirm it for a moment.
  const [done, setDone] = useState<'link' | 'image' | 'md' | null>(null);
  const [manualCopy, setManualCopy] = useState(false);
  const [thanked, setThanked] = useState(false); // after a first share, a line asks for a star
  const flash = (what: 'link' | 'image' | 'md') => { setDone(what); setThanked(true); setTimeout(() => setDone((d) => (d === what ? null : d)), 2000); };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      flash('link');
    } catch {
      setManualCopy(true); // no clipboard access: show the link to copy by hand
    }
  };
  const shareImage = async () => {
    const blob = await renderShareImage(data, report, `${location.origin}${import.meta.env.BASE_URL}`);
    const href = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href, download: 'my-stack.png' }).click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    flash('image');
  };
  const exportMd = () => {
    const lines = ['# Follow the Stack report', '', `Generated on ${new Date().toISOString().slice(0, 10)}`, ''];
    for (const r of flagged) {
      lines.push(`## ${r.product.name} (${data.entities[r.product.vendor]?.name})`, '');
      const org = provenance.get(r.product.id) ?? [];
      if (org.length) lines.push(`Found in: ${org.map((o) => o.label + (o.detail ? ` (${o.detail})` : '')).join(' · ')}`, '');
      for (const f of r.facts) {
        lines.push(`- **${f.entity.name}** · ${formatDate(f.fact.date, f.fact.datePrecision)} · ${f.fact.grievances.map((g) => GRIEVANCE_LABELS[g]).join(', ')}${f.fact.status === 'contested' ? ' (contested)' : ''}`);
        lines.push(`  ${f.fact.summary}`);
        f.fact.sources.forEach((s) => lines.push(`  - ${s.outlet}: ${s.url}`));
      }
      lines.push('');
    }
    lines.push('## No documented facts', '', ...clean.map((r) => `- ${r.product.name}`));
    const href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/markdown' }));
    Object.assign(document.createElement('a'), { href, download: 'follow-the-stack-report.md' }).click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
    flash('md');
  };
  const action = (what: 'link' | 'image' | 'md', icon: ReactNode, label: string, ok: string, onClick: () => void) => (
    <button type="button" onClick={onClick} aria-live="polite"
      className={`inline-flex items-center gap-1 transition-colors ${done === what ? 'font-medium text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground hover:text-foreground'}`}>
      {done === what ? <Check className="size-3.5" /> : icon}{done === what ? ok : label}
    </button>
  );

  return (
    <section className="grid gap-6 border-t pt-8" aria-labelledby="report-title">
      <GrievanceBar report={flagged} />
      <header className="grid gap-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 id="report-title" className="text-2xl font-semibold tracking-tight">{shared ? 'Behind this stack' : 'Behind your stack'}</h2>
          <span className="text-sm text-muted-foreground">{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          <span className="ml-auto flex gap-4 text-sm">
            {action('image', <ImageIcon className="size-3.5" />, 'Image', 'Downloaded', shareImage)}
            {action('link', <Link2 className="size-3.5" />, 'Copy link', 'Link copied', copyLink)}
            {action('md', <Download className="size-3.5" />, 'Markdown', 'Downloaded', exportMd)}
          </span>
        </div>
        {thanked && (
          <p className="justify-self-end text-sm text-muted-foreground">
            Thanks for sharing! A <a className="font-medium text-foreground underline underline-offset-4 hover:decoration-amber-500" href={REPO_URL}>★ on GitHub</a> helps too.
          </p>
        )}
        {manualCopy && (
          <input readOnly value={shareUrl} aria-label="Link to this report" autoFocus onFocus={(e) => e.currentTarget.select()}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm" />
        )}
        <p className="max-w-3xl text-lg leading-relaxed">
          {flagged.length === 0 ? (
            <>None of {shared ? 'these' : 'your'} {report.length} tools leads to a documented fact in our database.</>
          ) : (
            <>
              <strong>{flagged.length} of {shared ? 'these' : 'your'} {report.length} tools</strong> lead back to companies or people with documented facts.
              {top.length > 0 && <> Most of them come from {top.map(([id, f], i) => (
                <span key={id}>{i > 0 && (i === top.length - 1 ? ' and ' : ', ')}<a className="font-medium underline decoration-alert/50 underline-offset-4 hover:decoration-alert" href={url.entity(id)}>{data.entities[id]?.name}</a> ({f.size})</span>
              ))}.</>}
            </>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          {(projects.length > 1 || (projects.length > 0 && manualCount > 0)) && (
            <span className="flex flex-wrap gap-x-3">
              {[['all', 'All'], ...(manualCount ? [[MANUAL, 'Picked by hand']] : []), ...projects.map((p) => [p.id, p.name])].map(([id, label]) => (
                <button key={id} type="button" onClick={() => setScope(id)} className={scope === id ? 'font-medium text-foreground underline underline-offset-4' : 'hover:text-foreground'}>{label}</button>
              ))}
            </span>
          )}
          <label className="flex items-center gap-2">
            <Checkbox checked={indirect} onCheckedChange={(v) => setIndirect(v === true)} />
            Include minority investors (indirect)
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={former} onCheckedChange={(v) => setFormer(v === true)} />
            Include former founders, leaders and owners
          </label>
        </div>
      </header>

      <StackGraph data={data} productIds={report.map((r) => r.product.id)} indirect={indirect} former={former} shared={shared} />

      {flagged.length > 0 && (
        <div className="text-sm">
          <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_minmax(0,1.6fr)_auto] gap-4 border-b pb-2 text-xs uppercase tracking-wide text-muted-foreground md:grid">
            <span>Tool</span><span>Behind it</span><span>Documented</span><span className="sr-only">Details</span>
          </div>
          <ul>
            {flagged.map((r) => {
              const isOpen = open.has(r.product.id);
              const direct = r.chain.filter((c) => c.kind === 'direct');
              return (
                <li key={r.product.id} className="border-b">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 py-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_minmax(0,1.6fr)_auto] md:gap-y-0">
                    <div className="min-w-0">
                      <a className="font-medium hover:underline" href={url.product(r.product.id)}>{r.product.name}</a>
                      <div className="text-xs text-muted-foreground">{r.product.links.map((l) => LINK_LABELS[l].label).join(' · ')}</div>
                    </div>
                    <div className="col-span-2 row-start-2 min-w-0 text-muted-foreground md:col-span-1 md:row-start-auto">
                      <span className="mr-1 text-xs uppercase tracking-wide md:hidden">Behind it</span>
                      {direct.map((c, i) => (
                        <span key={c.entity.id}>{i > 0 && <span className="px-1">·</span>}<a className="hover:text-foreground hover:underline" href={url.entity(c.entity.id)}>{c.entity.name}</a></span>
                      ))}
                    </div>
                    <div className="col-span-2 row-start-3 min-w-0 md:col-span-1 md:row-start-auto">
                      <span className="font-medium tabular-nums text-alert">{r.facts.length} fact{r.facts.length === 1 ? '' : 's'}</span>
                      <div className="text-xs text-muted-foreground">
                        {r.grievances.map((g, i) => <span key={g}>{i > 0 && ', '}<a className="hover:text-foreground hover:underline" href={url.grievance(g)}>{GRIEVANCE_LABELS[g]}</a></span>)}
                      </div>
                    </div>
                    <div className="col-start-2 row-start-1 text-right md:col-start-auto md:row-start-auto">
                      <button type="button" aria-expanded={isOpen} onClick={() => toggle(r.product.id)}
                        className="inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                        {isOpen ? 'Hide' : 'Read'} <ChevronDown className={`size-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="pb-6 pt-1">
                      <div className="mb-3"><Provenance origins={provenance.get(r.product.id)} /></div>
                      <ol className="grid gap-4">
                        {r.facts.map(({ fact, entity, kind, via }) => (
                          <li key={fact.id} className="grid min-w-0 gap-1 border-l-2 pl-3 sm:pl-4" style={{ borderColor: GRIEVANCE_COLORS[fact.grievances[0]] }}>
                            <div className="text-xs text-muted-foreground">
                              <span className="tabular-nums">{formatDate(fact.date, fact.datePrecision)}</span>
                              {' · '}<a className="font-medium text-foreground hover:underline" href={url.entity(entity.id)}>{entity.name}</a>
                              {kind === 'former' && <> · <span className="text-foreground">former link{via.find((v) => v.until) ? `, ended ${via.find((v) => v.until)!.until!.slice(0, 4)}` : ''}</span></>}
                              {via.length > 0 && <> {kind === 'indirect' ? 'indirectly, ' : ''}via {via.map((v) => `${v.from} (${ROLE_LABELS[v.role]})`).join(' → ')}</>}
                              {' · '}{fact.grievances.map((g, i) => <span key={g}>{i > 0 && ', '}<a className="hover:underline" href={url.grievance(g)}>{GRIEVANCE_LABELS[g]}</a></span>)}
                              {fact.status === 'contested' && <> · <span className="text-foreground">contested</span></>}
                            </div>
                            <p className="break-words">{fact.summary}</p>
                            {fact.quote && <blockquote className="break-words text-muted-foreground italic" lang={fact.quote.lang}>“{fact.quote.text}”</blockquote>}
                            {fact.response && <p className="break-words text-muted-foreground">Response: {fact.response}</p>}
                            <p className="text-xs">
                              {fact.sources.map((s, i) => <span key={s.url}>{i > 0 && ' · '}<a className="text-muted-foreground underline underline-offset-2 hover:text-foreground" href={s.url} target="_blank" rel="noopener noreferrer">{s.outlet}</a></span>)}
                            </p>
                          </li>
                        ))}
                      </ol>
                      {r.product.alternatives.length > 0 && (
                        <p className="mt-4 text-sm text-muted-foreground">
                          Alternatives: {r.product.alternatives.map((id, i) => {
                            const a = data.products.find((p) => p.id === id);
                            return a ? <span key={id}>{i > 0 && ', '}<a className="text-foreground hover:underline" href={url.product(a.id)}>{a.name}</a></span> : null;
                          })}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {clean.length > 0 && (
        <p className="text-sm text-muted-foreground">
          <span className="text-foreground">Nothing documented yet</span> for{' '}
          {clean.map((r, i) => <span key={r.product.id}>{i > 0 && ', '}<a className="hover:text-foreground hover:underline" href={url.product(r.product.id)}>{r.product.name}</a></span>)}.
          {' '}That is information too, not a guarantee. <a className="underline underline-offset-2 hover:text-foreground" href={url.contribute({ type: 'fact' })}>Know something? Report it with sources.</a>
        </p>
      )}
    </section>
  );
}

// Full-width bar: each documented fact counts once per grievance; each segment's width is its share.
function GrievanceBar({ report }: { report: ProductReport[] }) {
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  for (const r of report) for (const { fact } of r.facts) {
    if (seen.has(fact.id)) continue;
    seen.add(fact.id);
    for (const g of fact.grievances) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (!total) return null;
  const parts = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const pct = (n: number) => Math.round((n / total) * 100);
  return (
    <div className="grid gap-3">
      <div className="flex h-4 w-full overflow-hidden rounded-full" role="img" aria-label={parts.map(([g, n]) => `${GRIEVANCE_LABELS[g]} ${pct(n)}%`).join(', ')}>
        {parts.map(([g, n]) => (
          <a key={g} href={url.grievance(g)} title={`${GRIEVANCE_LABELS[g]}: ${n} (${pct(n)}%)`}
            className="h-full transition-opacity hover:opacity-80" style={{ width: `${(n / total) * 100}%`, background: GRIEVANCE_COLORS[g] }} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {parts.map(([g, n]) => (
          <li key={g}>
            <a href={url.grievance(g)} className="inline-flex items-center gap-1.5 hover:text-foreground">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: GRIEVANCE_COLORS[g] }} />
              {GRIEVANCE_LABELS[g]} <span className="tabular-nums">{pct(n)}%</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Where the facts behind the stack come from, as a flow from the tools to their sources.
function StackGraph({ data, productIds, indirect, former, shared }: { data: Dataset; productIds: string[]; indirect: boolean; former: boolean; shared: boolean }) {
  return (
    <section className="grid gap-3 rounded-xl border p-4 sm:p-5" aria-labelledby="flow-title">
      <h3 id="flow-title" className="text-lg font-semibold">Where the facts come from</h3>
      <FlowView data={data} productIds={productIds} indirect={indirect} former={former} scope="stack" shared={shared} />
    </section>
  );
}

// After the report has been useful: a star helps other developers find the project.
function StarCard() {
  return (
    <aside className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-5">
      <p className="max-w-2xl text-sm text-muted-foreground">
        <span className="font-semibold text-foreground"><span className="text-amber-500" aria-hidden="true">★</span> Useful?</span>{' '}
        Follow the Stack is free, open source and has no tracker. A star on GitHub helps other developers find it.
      </p>
      <a href={REPO_URL} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-4 text-sm font-medium hover:bg-muted">
        <span className="text-amber-500" aria-hidden="true">★</span>Star on GitHub
      </a>
    </aside>
  );
}
