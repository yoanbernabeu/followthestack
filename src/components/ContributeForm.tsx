import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GRIEVANCE_LABELS } from '@/lib/labels';
import { issueUrl } from '@/lib/repo';

const LINK_OPTIONS = ['pay (you pay for it)', 'data (you entrust it with data)', 'depend (you depend on it, e.g. open source)'];

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function ContributeForm() {
  const [tab, setTab] = useState('fact');
  const [f, setF] = useState<Record<string, string>>({});
  const [griefs, setGriefs] = useState<string[]>([]);
  const [links, setLinks] = useState<string[]>([]);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (p.get('type')) setTab(p.get('type')!);
    const init: Record<string, string> = {};
    for (const k of ['subject', 'name', 'vendor', 'target']) if (p.get(k)) init[k] = p.get(k)!;
    setF(init);
  }, []);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const hasSource = (f.sources ?? '').match(/https?:\/\//);

  const urls = {
    fact: issueUrl('1-new-fact.yml', `[Fact] ${f.subject ?? ''} – ${f.summary?.slice(0, 60) ?? ''} (${f.date ?? ''})`, {
      subject: f.subject ?? '', grievances: griefs.join(','), date: f.date ?? '', summary: f.summary ?? '',
      quote: f.quote ?? '', sources: f.sources ?? '', response: f.response ?? '',
    }),
    product: issueUrl('2-new-product.yml', `[Product] ${f.name ?? ''}`, {
      name: f.name ?? '', vendor: f.vendor ?? '', links: links.join(','), ownership: f.ownership ?? '',
      detect: f.detect ?? '', alternatives: f.alternatives ?? '',
    }),
    correction: issueUrl('3-correction.yml', `[Correction] ${f.target ?? ''}`, {
      target: f.target ?? '', problem: f.problem ?? '', sources: f.sources ?? '',
    }),
  };
  const ready = {
    fact: !!(f.subject && griefs.length && f.date && f.summary && hasSource),
    product: !!(f.name && f.vendor && links.length && f.ownership),
    correction: !!(f.target && f.problem && hasSource),
  }[tab as 'fact' | 'product' | 'correction'];

  const chip = (active: boolean) => `rounded-full border px-3 py-1 text-sm ${active ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'}`;

  return (
    <div className="grid gap-6">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="fact">Report a fact</TabsTrigger>
          <TabsTrigger value="product">Add a tool</TabsTrigger>
          <TabsTrigger value="correction">Correct or dispute</TabsTrigger>
        </TabsList>

        <TabsContent value="fact" className="grid gap-4 pt-4">
          <Field id="subject" label="Who?" hint="A company, a fund or a public figure. Never a private person.">
            <Input id="subject" value={f.subject ?? ''} onChange={set('subject')} placeholder="e.g. Elon Musk, Palantir Technologies" />
          </Field>
          <div className="grid gap-1.5">
            <Label>Grievance(s)</Label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(GRIEVANCE_LABELS).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={griefs.includes(k)} className={chip(griefs.includes(k))} onClick={() => toggle(griefs, setGriefs, k)}>{l}</button>
              ))}
            </div>
          </div>
          <Field id="date" label="When?" hint="YYYY-MM-DD, or YYYY-MM if the day is unknown.">
            <Input id="date" value={f.date ?? ''} onChange={set('date')} placeholder="2025-01-20" className="max-w-48" />
          </Field>
          <Field id="summary" label="What happened?" hint="Neutral and factual. Describe what was said or done, not what you think of it.">
            <Textarea id="summary" value={f.summary ?? ''} onChange={set('summary')} />
          </Field>
          <Field id="quote" label="Exact quote (optional)" hint="Word for word, in the original language.">
            <Textarea id="quote" value={f.quote ?? ''} onChange={set('quote')} />
          </Field>
          <Field id="sources" label="Sources" hint="One URL per line. Major outlets, court or official documents, or the person's own post.">
            <Textarea id="sources" value={f.sources ?? ''} onChange={set('sources')} placeholder="https://" />
          </Field>
          <Field id="response" label="Denial or response by the subject (optional)">
            <Textarea id="response" value={f.response ?? ''} onChange={set('response')} />
          </Field>
        </TabsContent>

        <TabsContent value="product" className="grid gap-4 pt-4">
          <Field id="name" label="Tool, platform or library"><Input id="name" value={f.name ?? ''} onChange={set('name')} placeholder="e.g. Linear" /></Field>
          <Field id="vendor" label="Company, foundation or project behind it"><Input id="vendor" value={f.vendor ?? ''} onChange={set('vendor')} /></Field>
          <div className="grid gap-1.5">
            <Label>How does a stack relate to it?</Label>
            <div className="flex flex-wrap gap-2">
              {LINK_OPTIONS.map((o) => <button key={o} type="button" aria-pressed={links.includes(o)} className={chip(links.includes(o))} onClick={() => toggle(links, setLinks, o)}>{o}</button>)}
            </div>
          </div>
          <Field id="ownership" label="Owners, founders, main investors" hint="With sources, one per line."><Textarea id="ownership" value={f.ownership ?? ''} onChange={set('ownership')} /></Field>
          <Field id="detect" label="Package names or Docker images (optional)" hint="e.g. npm: @linear/sdk"><Textarea id="detect" value={f.detect ?? ''} onChange={set('detect')} /></Field>
          <Field id="alternatives" label="Alternatives (optional)"><Textarea id="alternatives" value={f.alternatives ?? ''} onChange={set('alternatives')} /></Field>
        </TabsContent>

        <TabsContent value="correction" className="grid gap-4 pt-4">
          <Field id="target" label="Which entry?" hint="The page URL on this site, or the name of the company or person."><Input id="target" value={f.target ?? ''} onChange={set('target')} /></Field>
          <Field id="problem" label="What is wrong or missing?" hint="If you are the subject of a fact, you can add your response here."><Textarea id="problem" value={f.problem ?? ''} onChange={set('problem')} /></Field>
          <Field id="sources-c" label="Sources supporting the correction"><Textarea id="sources-c" value={f.sources ?? ''} onChange={set('sources')} placeholder="https://" /></Field>
        </TabsContent>
      </Tabs>

      <div className="grid gap-2 rounded-lg border bg-muted/40 p-4 text-sm">
        <p>This opens a pre-filled issue on GitHub. Nothing is sent from this site: you review it and submit it yourself (a free GitHub account is needed). A human reviews every contribution before anything is published.</p>
        <div>
          <Button asChild disabled={!ready}>
            <a href={ready ? urls[tab as keyof typeof urls] : undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!ready} className={!ready ? 'pointer-events-none opacity-50' : ''}>
              Continue on GitHub <ExternalLink />
            </a>
          </Button>
          {!ready && <span className="ml-3 text-xs text-muted-foreground">Fill in the required fields{tab !== 'product' ? ', including at least one source URL' : ''}.</span>}
        </div>
      </div>
    </div>
  );
}
