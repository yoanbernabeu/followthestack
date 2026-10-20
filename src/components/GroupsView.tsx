import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import type { Group } from '@/lib/groups';
import { CATEGORY_LABELS, GRIEVANCE_LABELS, formatDate } from '@/lib/labels';
import { url } from '@/lib/urls';

type Sort = 'facts' | 'tools';

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;
// A log scale keeps one very heavy group from washing out every other cell.
const heatOf = (n: number, max: number) => (n ? Math.min(1, Math.log2(1 + n) / Math.log2(1 + max)) : 0);
const heatBg = (h: number) => (h ? `color-mix(in oklch, var(--alert) ${Math.round(26 + 70 * h)}%, transparent)` : undefined);

/** Who concentrates the documented facts: a grievance heat map, then the groups, with their tools and alternatives. */
export default function GroupsView({ groups }: { groups: Group[] }) {
  const [query, setQuery] = useState('');
  const [grievance, setGrievance] = useState<string | null>(null);
  const [category, setCategory] = useState('');
  const [withTools, setWithTools] = useState(true);
  const [sort, setSort] = useState<Sort>('facts');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [allRows, setAllRows] = useState(false);

  // A link such as /groups/#microsoft opens that group.
  useEffect(() => {
    const go = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      const target = groups.find((g) => g.id === id);
      if (!target) return;
      if (!target.products.length) setWithTools(false);
      setOpen((o) => new Set(o).add(id));
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
    };
    go();
    window.addEventListener('hashchange', go);
    return () => window.removeEventListener('hashchange', go);
  }, [groups]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups
      .filter((g) => !withTools || g.products.length > 0)
      .filter((g) => !grievance || g.grievances[grievance])
      .filter((g) => !category || g.categories.includes(category))
      .filter((g) => !q || g.members.some((m) => m.name.toLowerCase().includes(q)) || g.products.some((p) => p.name.toLowerCase().includes(q)))
      .sort((a, b) =>
        sort === 'tools'
          ? b.products.length - a.products.length || b.facts.length - a.facts.length
          : (grievance ? b.grievances[grievance] - a.grievances[grievance] : 0) || b.facts.length - a.facts.length || b.products.length - a.products.length,
      );
  }, [groups, query, grievance, category, withTools, sort]);

  // Grievance columns, most frequent first, over the groups shown.
  const columns = useMemo(() => {
    const total: Record<string, number> = {};
    for (const g of shown) for (const [k, n] of Object.entries(g.grievances)) total[k] = (total[k] ?? 0) + n;
    return Object.keys(total).sort((a, b) => total[b] - total[a]);
  }, [shown]);
  const rows = allRows ? shown : shown.slice(0, 15);
  const max = Math.max(1, ...shown.flatMap((g) => Object.values(g.grievances)));
  const categories = useMemo(() => [...new Set(groups.flatMap((g) => g.categories))].sort((a, b) => (CATEGORY_LABELS[a] ?? a).localeCompare(CATEGORY_LABELS[b] ?? b)), [groups]);
  const hidden = groups.filter((g) => !g.products.length).length;

  const reveal = (id: string, g?: string) => {
    if (g !== undefined) setGrievance(g);
    setOpen((o) => new Set(o).add(id));
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const toggle = (id: string) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const chip = (on: boolean) => `h-8 shrink-0 rounded-full border px-3 text-xs transition-colors ${on ? 'border-foreground bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`;

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative w-full sm:w-64">
          <span className="sr-only">Search a company, person or product</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Company, person or product"
            className="h-8 w-full rounded-full border bg-transparent pr-3 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <select
          value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category"
          className="h-8 rounded-full border bg-background px-3 text-xs text-muted-foreground"
        >
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</option>)}
        </select>
        <button type="button" className={chip(withTools)} aria-pressed={withTools} onClick={() => setWithTools((v) => !v)} title={`${hidden} groups make none of the listed tools`}>
          Behind listed tools only
        </button>
        <span className="ml-auto flex gap-1 text-xs text-muted-foreground" role="group" aria-label="Sort">
          <button type="button" className={chip(sort === 'facts')} aria-pressed={sort === 'facts'} onClick={() => setSort('facts')}>Most facts</button>
          <button type="button" className={chip(sort === 'tools')} aria-pressed={sort === 'tools'} onClick={() => setSort('tools')}>Most tools</button>
        </span>
        {grievance && (
          <button type="button" className="inline-flex h-8 items-center gap-1 rounded-full bg-alert/15 px-3 text-xs font-medium text-alert" onClick={() => setGrievance(null)}>
            {GRIEVANCE_LABELS[grievance]} <X className="size-3.5" aria-label="Clear" />
          </button>
        )}
      </div>

      {!shown.length ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">No group matches these filters.</p>
      ) : (
        <>
          <section aria-labelledby="map-title" className="grid gap-3">
            <div>
              <h2 id="map-title" className="text-xl font-semibold">Who, for what</h2>
              <p className="text-sm text-muted-foreground">Facts per group and grievance. Click a cell to read those facts, a column to filter by grievance.</p>
            </div>
            <div className="max-w-full justify-self-start overflow-x-auto rounded-lg border">
              <table className="border-collapse text-sm">
                <thead>
                  <tr className="border-b">
                    <th scope="col" className="sticky left-0 z-10 bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground">Group</th>
                    <th scope="col" className="px-2 py-2 text-right text-xs font-medium text-muted-foreground">Facts</th>
                    <th scope="col" className="px-2 py-2 text-right text-xs font-medium text-muted-foreground">Tools</th>
                    {columns.map((c) => (
                      <th key={c} scope="col" className="h-36 w-10 min-w-10 px-0 align-bottom">
                        <button
                          type="button" onClick={() => setGrievance(grievance === c ? null : c)} aria-pressed={grievance === c}
                          className={`mx-auto block pb-2 text-left text-xs whitespace-nowrap [writing-mode:vertical-rl] rotate-180 hover:text-foreground ${grievance === c ? 'font-semibold text-alert' : 'font-medium text-muted-foreground'}`}
                        >
                          {GRIEVANCE_LABELS[c] ?? c}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((g) => (
                    <tr key={g.id} className="border-b last:border-0 hover:bg-muted/40">
                      <th scope="row" className="sticky left-0 z-10 max-w-48 truncate bg-card px-3 py-1.5 text-left font-medium">
                        <button type="button" className="truncate hover:underline" onClick={() => reveal(g.id)}>{g.label}</button>
                      </th>
                      <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{g.facts.length}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{g.products.length || '–'}</td>
                      {columns.map((c) => {
                        const n = g.grievances[c] ?? 0;
                        const h = heatOf(n, max);
                        return (
                          <td key={c} className="w-10 min-w-10 p-0.5">
                            {n > 0 && (
                              <button
                                type="button" onClick={() => reveal(g.id, c)}
                                title={`${g.label}: ${plural(n, 'fact')} for ${GRIEVANCE_LABELS[c] ?? c}`}
                                className={`flex h-8 w-full items-center justify-center rounded text-xs tabular-nums hover:ring-2 hover:ring-foreground/40 ${h > 0.55 ? 'font-semibold text-background' : 'text-foreground'}`}
                                style={{ background: heatBg(h) }}
                              >
                                {n}
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {shown.length > 15 && (
              <button type="button" className="justify-self-start text-sm underline underline-offset-4" onClick={() => setAllRows((v) => !v)}>
                {allRows ? 'Show the first 15 groups' : `Show all ${shown.length} groups`}
              </button>
            )}
          </section>

          <section aria-labelledby="list-title" className="grid gap-3">
            <div>
              <h2 id="list-title" className="text-xl font-semibold">The groups, their tools and alternatives</h2>
              <p className="text-sm text-muted-foreground">
                A group is a company with its parents and subsidiaries, and the people who run, founded or sit on the board of them. Open one to see what you may use from it and what to use instead.
              </p>
            </div>
            <ol className="grid gap-2">
              {shown.map((g) => (
                <GroupRow key={g.id} g={g} max={Math.max(...shown.map((s) => s.facts.length))} open={open.has(g.id)} onToggle={() => toggle(g.id)} grievance={grievance} />
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}

function GroupRow({ g, max, open, onToggle, grievance }: { g: Group; max: number; open: boolean; onToggle: () => void; grievance: string | null }) {
  const [allFacts, setAllFacts] = useState(false);
  const [allTools, setAllTools] = useState(false);
  const carriers = g.members.filter((m) => m.facts > 0);
  const grievances = Object.entries(g.grievances).sort((a, b) => b[1] - a[1]);
  const facts = grievance ? g.facts.filter((f) => f.grievances.includes(grievance)) : g.facts;
  const name = (id: string) => g.members.find((m) => m.id === id)?.name ?? id;

  return (
    <li id={g.id} className="scroll-mt-20 rounded-lg border bg-card">
      <button type="button" onClick={onToggle} aria-expanded={open} className="grid w-full gap-2 p-4 text-left sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <span className="grid gap-1">
          <span className="flex flex-wrap items-baseline gap-x-3">
            <span className="text-base font-semibold">{g.label}</span>
            <span className="text-sm text-muted-foreground">
              {carriers.slice(0, 4).map((m) => `${m.name} (${m.facts})`).join(', ')}{carriers.length > 4 ? `, +${carriers.length - 4}` : ''}
            </span>
          </span>
          <span className="flex flex-wrap gap-1.5">
            {grievances.slice(0, 4).map(([k, n]) => (
              <span key={k} className={`rounded-full px-2 py-0.5 text-xs ${k === grievance ? 'bg-alert text-background' : 'bg-alert/10 text-alert'}`}>{GRIEVANCE_LABELS[k] ?? k} · {n}</span>
            ))}
            {grievances.length > 4 && <span className="px-1 py-0.5 text-xs text-muted-foreground">+{grievances.length - 4}</span>}
          </span>
        </span>
        <span className="flex items-center gap-4 text-sm">
          <span className="grid w-32 gap-1">
            <span className="tabular-nums"><strong>{g.facts.length}</strong> <span className="text-muted-foreground">{g.facts.length > 1 ? 'facts' : 'fact'}</span></span>
            <span className="h-1.5 rounded-full bg-muted" aria-hidden="true">
              <span className="block h-full rounded-full bg-alert" style={{ width: `${Math.max(4, (100 * g.facts.length) / max)}%` }} />
            </span>
          </span>
          <span className="w-16 tabular-nums text-muted-foreground">{g.products.length ? plural(g.products.length, 'tool') : 'no tool'}</span>
          <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </span>
      </button>

      {open && (
        <div className="grid gap-6 border-t p-4 lg:grid-cols-2">
          <div className="grid content-start gap-3">
            <h3 className="text-sm font-semibold">{g.products.length ? `Its tools (${g.products.length}) and alternatives` : 'No listed tool'}</h3>
            {g.products.length > 0 && (
              <ul className="grid gap-2">
                {(allTools ? g.products : g.products.slice(0, 8)).map((p) => {
                  const clean = p.alternatives.filter((a) => !a.facts);
                  return (
                    <li key={p.id} className="grid gap-0.5 text-sm">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <a className="font-medium hover:underline" href={url.product(p.id)}>{p.name}</a>
                        <span className="text-xs text-muted-foreground">{CATEGORY_LABELS[p.category] ?? p.category}</span>
                        {p.facts > 0 && <span className="text-xs text-alert">{plural(p.facts, 'fact')} reach it</span>}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {clean.length ? (
                          <>Without documented fact: {clean.map((a, i) => <span key={a.id}>{i > 0 && ', '}<a className="text-foreground underline decoration-muted-foreground/50 underline-offset-2 hover:decoration-foreground" href={url.product(a.id)}>{a.name}</a></span>)}</>
                        ) : p.alternatives.length ? 'Its listed alternatives also carry facts' : 'No alternative listed yet'}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {g.products.length > 8 && (
              <button type="button" className="justify-self-start text-xs underline underline-offset-4" onClick={() => setAllTools((v) => !v)}>
                {allTools ? 'Show fewer' : `Show all ${g.products.length} tools`}
              </button>
            )}
          </div>

          <div className="grid content-start gap-3">
            <h3 className="text-sm font-semibold">
              {grievance ? `${GRIEVANCE_LABELS[grievance]}: ${plural(facts.length, 'fact')}` : `Facts (${facts.length})`}
            </h3>
            <ul className="grid gap-3">
              {(allFacts ? facts : facts.slice(0, 5)).map((f) => (
                <li key={f.id} className="grid gap-0.5 text-sm">
                  <span className="text-xs text-muted-foreground">
                    <a className="font-medium text-foreground hover:underline" href={url.entity(f.subject)}>{name(f.subject)}</a> · {formatDate(f.date, f.datePrecision)}
                    {f.status === 'contested' && ' · contested'}
                  </span>
                  <span>{f.summary}</span>
                </li>
              ))}
            </ul>
            {facts.length > 5 && (
              <button type="button" className="justify-self-start text-xs underline underline-offset-4" onClick={() => setAllFacts((v) => !v)}>
                {allFacts ? 'Show fewer' : `Show all ${facts.length} facts`}
              </button>
            )}
            <p className="text-xs text-muted-foreground">
              Sources are on each page:{' '}
              {carriers.map((m, i) => <span key={m.id}>{i > 0 && ', '}<a className="underline underline-offset-2" href={url.entity(m.id)}>{m.name}</a></span>)}
            </p>
          </div>
        </div>
      )}
    </li>
  );
}
