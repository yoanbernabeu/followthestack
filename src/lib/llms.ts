import type { Dataset, Fact } from './types';
import { CATEGORY_LABELS, GRIEVANCE_DESCRIPTIONS, GRIEVANCE_LABELS, formatDate } from './labels';

export const text = (body: string) => new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

export function siteBase(site: URL | undefined) {
  return new URL(import.meta.env.BASE_URL.replace(/\/?$/, '/'), site).href;
}

const INTRO = `> An open database of who is behind the tools developers use (vendors, parent companies, controlling owners, founders, leaders, board members) and what they have documentedly said and done. Every fact has sources; a grievance qualifies a documented fact, never a person.

Key rules:
- Facts are only about organisations and public figures, and each one cites at least one source.
- \`established\` facts are documented and undisputed; \`contested\` facts are disputed and carry the subject's response.
- A fact reaches a tool through current ownership and leadership links (parent, controlling owner, founder, leader, board member). Minority investors and former links are not counted by default.
- No tracker, no backend: stack analysis runs in the browser. Code MIT, data CC BY-SA 4.0.`;

export function llmsTxt(data: Dataset, site: URL | undefined) {
  const b = siteBase(site);
  return `# Follow the Stack

${INTRO}

## Main pages

- [Analyze a stack](${b}): paste or import package.json, composer.json, Gemfile, requirements.txt, pyproject.toml, Dockerfile or compose files, or pick tools, and see the facts behind them.
- [All facts](${b}facts/): ${data.facts.length} documented facts with their sources.
- [About and method](${b}about/): rules, link types, grievance definitions.
- [Contribute](${b}contribute/): report a fact, add a tool or request a correction (GitHub issues, source required).

## Data

- [Full dataset (JSON)](${b}data.json): ${data.products.length} products, ${Object.keys(data.entities).length} entities, ${data.facts.length} facts.
- [Every fact as plain text](${b}llms-full.txt)
- [Source code and data (GitHub)](https://github.com/yoanbernabeu/followthestack)

## Grievances

${Object.entries(GRIEVANCE_LABELS).map(([id, l]) => `- [${l}](${b}grievance/${id}/): ${GRIEVANCE_DESCRIPTIONS[id]}`).join('\n')}

## Categories

${Object.entries(CATEGORY_LABELS).map(([id, l]) => `- [${l}](${b}category/${id}/)`).join('\n')}
`;
}

function factBlock(data: Dataset, f: Fact, b: string) {
  const s = data.entities[f.subject];
  return [
    `### ${s?.name ?? f.subject}, ${formatDate(f.date, f.datePrecision)}`,
    '',
    `- Subject: [${s?.name ?? f.subject}](${b}entity/${f.subject}/)`,
    `- Grievances: ${f.grievances.map((g) => GRIEVANCE_LABELS[g]).join(', ')}`,
    `- Status: ${f.status}`,
    '',
    f.summary,
    ...(f.quote ? ['', `Quote (${f.quote.lang}): "${f.quote.text}"`] : []),
    ...(f.response ? ['', `Response: ${f.response}`] : []),
    '',
    'Sources:',
    ...f.sources.map((src) => `- [${src.outlet}](${src.url})${src.date ? ` (${src.date})` : ''}`),
  ].join('\n');
}

export function llmsFullTxt(data: Dataset, site: URL | undefined) {
  const b = siteBase(site);
  const facts = [...data.facts].sort((x, y) => y.date.localeCompare(x.date));
  const products = [...data.products].sort((x, y) => x.name.localeCompare(y.name));
  return `# Follow the Stack: full text

${INTRO}

## Facts (${facts.length})

${facts.map((f) => factBlock(data, f, b)).join('\n\n')}

## Products (${products.length})

${products.map((p) => `- [${p.name}](${b}product/${p.id}/), ${CATEGORY_LABELS[p.category] ?? p.category}, by ${data.entities[p.vendor]?.name ?? p.vendor}`).join('\n')}
`;
}
