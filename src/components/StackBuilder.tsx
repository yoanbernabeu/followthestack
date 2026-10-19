import { useMemo, useRef, useState } from 'react';
import { ClipboardPaste, FileUp, FolderUp, Lock, Search, Sparkles, X, CircleAlert, Plus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import type { Dataset, Product } from '@/lib/types';
import { CATEGORY_LABELS } from '@/lib/labels';
import { emptyDetected, isSupported, parseFile, type Detected } from '@/lib/parsers';
import { matchProductsDetailed } from '@/lib/report';

export type ProjectSource = 'paste' | 'files' | 'folder' | 'link';
export type Project = {
  id: string;
  name: string;
  source: ProjectSource;
  files: string[];
  productIds: string[];
  // productId -> dependency keys that matched, e.g. ["npm: stripe"]
  matches: Record<string, string[]>;
};

export const SOURCE_LABELS: Record<ProjectSource, string> = {
  paste: 'Pasted file',
  files: 'Imported files',
  folder: 'Scanned folder',
  link: 'From shared link',
};

// Well-known tools shown first, so most people never need to browse the full catalog.
const POPULAR = [
  'github', 'gitlab', 'vs-code', 'cursor', 'chatgpt', 'claude', 'github-copilot', 'amazon-web-services', 'google-cloud', 'microsoft-azure',
  'vercel', 'cloudflare-cdn', 'ovhcloud', 'scaleway', 'google-workspace', 'microsoft-365', 'slack', 'microsoft-teams', 'zoom',
  'notion', 'jira', 'figma', 'stripe', 'google-analytics', 'sentry', 'datadog', 'docker-hub', 'x', 'linkedin', 'whatsapp',
  'react', 'nextjs', 'symfony', 'laravel', 'ruby-on-rails', 'wordpress', 'postgresql', 'mysql',
];

const EXAMPLE = ['github', 'vs-code', 'amazon-web-services', 'slack', 'google-workspace', 'stripe', 'google-analytics', 'x', 'ruby-on-rails', 'cursor'];

function guessFileName(text: string): string {
  try {
    const j = JSON.parse(text);
    if (j.dependencies || j.devDependencies || j.peerDependencies) return 'package.json';
    if (j.require || j['require-dev']) return 'composer.json';
    if (j.packages) return 'composer.lock';
  } catch { /* not JSON */ }
  if (/^\s*gem\s+["']/m.test(text)) return 'Gemfile';
  if (/^GEM$/m.test(text) || /^ {2}specs:/m.test(text)) return 'Gemfile.lock';
  if (/^\[(project|tool\.poetry)/m.test(text)) return 'pyproject.toml';
  if (/^\s*services:\s*$/m.test(text) && /image:/.test(text)) return 'docker-compose.yml';
  if (/^\s*FROM\s+\S+/im.test(text)) return 'Dockerfile';
  return 'requirements.txt';
}

type Props = {
  data: Dataset;
  flagged: Set<string>;
  manual: Set<string>;
  setManual: (fn: (s: Set<string>) => Set<string>) => void;
  projects: Project[];
  setProjects: (fn: (p: Project[]) => Project[]) => void;
};

export default function StackBuilder({ data, flagged, manual, setManual, projects, setProjects }: Props) {
  const toggle = (id: string) => setManual((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const byId = useMemo(() => new Map(data.products.map((p) => [p.id, p])), [data]);

  const [panel, setPanel] = useState<'none' | 'paste' | 'import'>('none');
  return (
    <div className="grid gap-6">
      <PickPanel data={data} byId={byId} flagged={flagged} manual={manual} toggle={toggle} setManual={setManual} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-4 text-sm text-muted-foreground">
        <span>Prefer to start from your code?</span>
        <Button variant={panel === 'paste' ? 'secondary' : 'ghost'} size="sm" onClick={() => setPanel(panel === 'paste' ? 'none' : 'paste')}><ClipboardPaste /> Paste a dependency file</Button>
        <Button variant={panel === 'import' ? 'secondary' : 'ghost'} size="sm" onClick={() => setPanel(panel === 'import' ? 'none' : 'import')}><FolderUp /> Scan project folders</Button>
      </div>
      {panel === 'paste' && <PastePanel data={data} onProject={(p) => setProjects((ps) => [...ps, p])} count={projects.length} />}
      {panel === 'import' && <ImportPanel data={data} projects={projects} setProjects={setProjects} />}

      {projects.length > 0 && (
        <ul className="grid gap-2">
          {projects.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <Input
                aria-label="Project name"
                className="h-8 max-w-xs"
                value={p.name}
                onChange={(e) => setProjects((ps) => ps.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))}
              />
              <span className="text-muted-foreground">{SOURCE_LABELS[p.source]}{p.files.length ? ` · ${p.files.map((f) => f.split('/').pop()).join(', ')}` : ''} · {p.productIds.length} known tool(s)</span>
              <Button variant="ghost" size="icon" className="ml-auto" aria-label="Remove project" onClick={() => setProjects((ps) => ps.filter((x) => x.id !== p.id))}><X /></Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ToolChip({ p, active, flagged, onClick, vendor }: { p: Product; active: boolean; flagged: boolean; onClick: () => void; vendor?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={vendor ? `${p.name} · ${vendor}` : p.name}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
        active ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'
      }`}
    >
      {active ? <Check className="size-3.5" /> : <Plus className="size-3.5 text-muted-foreground" />}
      {p.name}
    </button>
  );
}

function PickPanel({ data, byId, flagged, manual, toggle, setManual }: {
  data: Dataset; byId: Map<string, Product>; flagged: Set<string>; manual: Set<string>; toggle: (id: string) => void;
  setManual: (fn: (s: Set<string>) => Set<string>) => void;
}) {
  const [query, setQuery] = useState('');
  const [browse, setBrowse] = useState(false);
  const q = query.trim().toLowerCase();
  const vendorName = (p: Product) => data.entities[p.vendor]?.name ?? '';
  const results = q
    ? data.products
        .filter((p) => `${p.name} ${vendorName(p)} ${CATEGORY_LABELS[p.category] ?? ''}`.toLowerCase().includes(q))
        .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)))
        .slice(0, 24)
    : [];
  const popular = POPULAR.map((id) => byId.get(id)).filter((p): p is Product => !!p);
  const categories = useMemo(() => {
    const m = new Map<string, Product[]>();
    for (const p of data.products) m.set(p.category, [...(m.get(p.category) ?? []), p]);
    return [...m.entries()].sort((a, b) => (CATEGORY_LABELS[a[0]] ?? a[0]).localeCompare(CATEGORY_LABELS[b[0]] ?? b[0]));
  }, [data]);
  const selected = [...manual].map((id) => byId.get(id)).filter((p): p is Product => !!p);

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            className="h-10 pl-9"
            placeholder={`Search ${data.products.length} tools, platforms and libraries… (e.g. Slack, Stripe, Symfony)`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) { toggle(results[0].id); setQuery(''); } }}
            aria-label="Search tools"
          />
        </div>
        {q && (
          <div className="flex flex-wrap gap-2">
            {results.length === 0 && <p className="text-sm text-muted-foreground">Nothing found. <a className="underline" href={`${import.meta.env.BASE_URL.replace(/\/?$/, "/")}contribute/?type=product&name=${encodeURIComponent(query)}`}>Suggest a tool</a>.</p>}
            {results.map((p) => <ToolChip key={p.id} p={p} vendor={vendorName(p)} active={manual.has(p.id)} flagged={flagged.has(p.id)} onClick={() => toggle(p.id)} />)}
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <div className="grid gap-2 rounded-lg bg-muted/50 p-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            Your stack · {selected.length}
            <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={() => setManual(() => new Set())}>Clear</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {selected.map((p) => (
              <Badge key={p.id} variant="secondary" className="h-7 gap-1 pl-3 pr-1 text-sm">
                {p.name}
                <button type="button" className="rounded-full p-0.5 hover:bg-background" aria-label={`Remove ${p.name}`} onClick={() => toggle(p.id)}><X className="size-3.5" /></button>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {!q && (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium">Popular</h3>
            {manual.size === 0 && (
              <Button variant="link" size="sm" className="ml-auto h-7" onClick={() => setManual(() => new Set(EXAMPLE.filter((id) => byId.has(id))))}>
                <Sparkles /> Try an example stack
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {popular.map((p) => <ToolChip key={p.id} p={p} vendor={vendorName(p)} active={manual.has(p.id)} flagged={flagged.has(p.id)} onClick={() => toggle(p.id)} />)}
          </div>
        </div>
      )}

      {!q && !browse && (
        <div>
          <Button variant="link" size="sm" className="h-7 px-0" onClick={() => setBrowse(true)}>Browse all {data.products.length} tools by category</Button>
        </div>
      )}
      {!q && browse && (
        <div className="grid gap-1">
          <h3 className="text-sm font-medium">Browse by category</h3>
          <Accordion type="multiple" className="rounded-lg border">
            {categories.map(([cat, items]) => {
              const n = items.filter((p) => manual.has(p.id)).length;
              return (
                <AccordionItem key={cat} value={cat} className="px-4">
                  <AccordionTrigger className="py-3">
                    <span className="flex items-center gap-2">
                      {CATEGORY_LABELS[cat] ?? cat}
                      <span className="text-xs text-muted-foreground">{items.length}</span>
                      {n > 0 && <Badge>{n} selected</Badge>}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="flex flex-wrap gap-2">
                    {items.map((p) => <ToolChip key={p.id} p={p} vendor={vendorName(p)} active={manual.has(p.id)} flagged={flagged.has(p.id)} onClick={() => toggle(p.id)} />)}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>
      )}
    </div>
  );
}

function PrivacyNote() {
  return (
    <div className="flex gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
      <Lock className="mt-0.5 size-4 shrink-0" />
      <div className="grid gap-1">
        <p className="font-medium">Nothing is uploaded. Ever.</p>
        <p className="text-muted-foreground">
          This site has no server. Your browser reads the file locally and only keeps package names (like <code>stripe/stripe-php</code>), never your code, versions or secrets.
          Want proof? Open your browser's network tab, or switch off your Wi-Fi now: the analysis still works.
        </p>
      </div>
    </div>
  );
}

function PastePanel({ data, onProject, count }: { data: Dataset; onProject: (p: Project) => void; count: number }) {
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const analyse = () => {
    const name = guessFileName(text);
    const detected = emptyDetected();
    parseFile(name, text, detected);
    const matched = matchProductsDetailed(data, detected);
    const ids = [...matched.keys()];
    const found = Object.values(detected).reduce((n, s) => n + s.size, 0);
    if (!found) { setMsg('No dependency recognised. Paste the content of a package.json, composer.json, Gemfile, requirements.txt, pyproject.toml, Dockerfile or docker-compose.yml.'); return; }
    onProject({ id: `${Date.now()}`, name: `Pasted ${name} ${count + 1}`, source: 'paste', files: [name], productIds: ids, matches: Object.fromEntries(matched) });
    setMsg(`Read as ${name}: ${found} dependencies, ${ids.length} known tool(s).`);
    setText('');
  };
  return (
    <div className="grid gap-3">
      <PrivacyNote />
      <Textarea
        className="min-h-40 font-mono text-xs"
        placeholder={'Paste the content of package.json, composer.json, Gemfile, requirements.txt…\n\n{\n  "dependencies": { "react": "^19.0.0", "stripe": "^17.0.0" }\n}'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Dependency file content"
      />
      <div className="flex items-center gap-3">
        <Button onClick={analyse} disabled={!text.trim()}>Analyse</Button>
        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      </div>
    </div>
  );
}

function ImportPanel({ data, projects, setProjects }: { data: Dataset; projects: Project[]; setProjects: (fn: (p: Project[]) => Project[]) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const dirInput = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function handle(list: FileList | null) {
    if (!list) return;
    const groups = new Map<string, { files: string[]; detected: Detected }>();
    let skipped = 0;
    for (const file of Array.from(list)) {
      const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      if (!isSupported(path)) { skipped++; continue; }
      // Folders: one project per directory. Loose files picked together: one project, renamable.
      const dir = path.includes('/') ? path.split('/').slice(0, -1).join('/') : `Project ${projects.length + 1}`;
      const g = groups.get(dir) ?? { files: [], detected: emptyDetected() };
      parseFile(path, await file.text(), g.detected);
      g.files.push(path);
      groups.set(dir, g);
    }
    const fromFolder = Array.from(list).some((f) => (f as File & { webkitRelativePath?: string }).webkitRelativePath);
    const added: Project[] = [...groups.entries()].map(([dir, g], k) => {
      const matched = matchProductsDetailed(data, g.detected);
      return { id: `${Date.now()}-${k}`, name: dir, source: fromFolder ? 'folder' : 'files', files: g.files, productIds: [...matched.keys()], matches: Object.fromEntries(matched) };
    });
    setProjects((ps) => [...ps, ...added]);
    setMsg(added.length
      ? `${added.length} project(s) read locally. ${skipped ? `${skipped} other file(s) were ignored without being read.` : ''}`
      : 'No dependency file found in this selection.');
  }

  return (
    <div className="grid gap-3">
      <PrivacyNote />
      <div
        className={`grid gap-3 rounded-lg border border-dashed p-8 text-center text-sm ${dragging ? 'bg-muted' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files); }}
      >
        <p className="text-muted-foreground">
          Select one or several repositories: every sub-folder with a dependency file becomes a project, so you can audit a whole company at once.
          Only <code>package.json</code>, <code>composer.json/.lock</code>, <code>Gemfile/.lock</code>, <code>requirements.txt</code>, <code>pyproject.toml</code>, <code>Dockerfile</code> and <code>docker-compose.yml</code> are read; <code>node_modules</code>, <code>vendor</code> and everything else are skipped.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => dirInput.current?.click()}><FolderUp /> Scan a folder</Button>
          <Button variant="outline" onClick={() => fileInput.current?.click()}><FileUp /> Pick files</Button>
        </div>
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => { handle(e.target.files); e.target.value = ''; }} />
        <input ref={dirInput} type="file" multiple hidden {...({ webkitdirectory: '' } as object)} onChange={(e) => { handle(e.target.files); e.target.value = ''; }} />
      </div>
      {msg && <p className="flex items-center gap-2 text-sm text-muted-foreground"><CircleAlert className="size-4" />{msg}</p>}
    </div>
  );
}
