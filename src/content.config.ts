import { defineCollection, reference } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Closed list of grievances. A grievance always qualifies a documented fact, never a person.
export const GRIEVANCES = [
  'racism',
  'antisemitism',
  'islamophobia',
  'lgbtphobia',
  'sexism',
  'anti-immigration',
  'far-right-support',
  'anti-democracy',
  'surveillance-deportation',
  'press-justice-attacks',
  'violent-rhetoric',
  'authoritarian-alignment',
  'far-right-funding',
  'war-crimes-support',
] as const;

export const CATEGORIES = [
  'cloud-hosting',
  'cdn-dns-security',
  'email',
  'analytics',
  'auth-identity',
  'payments',
  'monitoring',
  'ai',
  'dev-tools',
  'code-hosting',
  'frameworks-libraries',
  'databases',
  'storage',
  'collaboration',
  'communication',
  'social-media',
  'advertising',
  'crm-marketing',
  'design',
  'os-hardware',
  'browser-search',
] as const;

// How a stack relates to a product: you pay for it, you entrust it with data, or you depend on it.
export const LINKS = ['pay', 'data', 'depend'] as const;

const source = z.object({
  url: z.url(),
  outlet: z.string(),
  date: z.coerce.date().optional(),
  archive: z.url().optional(),
});

const entities = defineCollection({
  loader: glob({ base: './data/entities', pattern: '**/*.yml' }),
  schema: z
    .object({
      name: z.string(),
      type: z.enum(['company', 'investment-fund', 'person', 'foundation', 'government', 'project']),
      // Facts may only target organisations and public figures. Private individuals stay out.
      publicFigure: z.boolean().optional(),
      description: z.string(),
      country: z.string().length(2).optional(),
      website: z.url().optional(),
      wikidata: z.string().regex(/^Q\d+$/).optional(),
      reviewed: z.coerce.date().optional(),
      relations: z
        .array(
          z.object({
            target: reference('entities'),
            role: z.enum(['subsidiary-of', 'founded-by', 'led-by', 'owned-by', 'invested-by', 'board-member']),
            since: z.coerce.date().optional(),
            until: z.coerce.date().optional(),
            sources: z.array(source).min(1),
          }),
        )
        .default([]),
    })
    .refine((e) => e.type !== 'person' || e.publicFigure === true, {
      message: 'A person entity must be a public figure (publicFigure: true).',
    }),
});

const products = defineCollection({
  loader: glob({ base: './data/products', pattern: '**/*.yml' }),
  schema: z.object({
    name: z.string(),
    vendor: reference('entities'),
    category: z.enum(CATEGORIES),
    links: z.array(z.enum(LINKS)).min(1),
    description: z.string(),
    website: z.url().optional(),
    detect: z
      .object({
        npm: z.array(z.string()).default([]),
        composer: z.array(z.string()).default([]),
        gems: z.array(z.string()).default([]),
        pypi: z.array(z.string()).default([]),
        docker: z.array(z.string()).default([]),
      })
      .default({ npm: [], composer: [], gems: [], pypi: [], docker: [] }),
    alternatives: z.array(reference('products')).default([]),
  }),
});

const facts = defineCollection({
  loader: glob({ base: './data/facts', pattern: '**/*.yml' }),
  schema: z.object({
    subject: reference('entities'),
    grievances: z.array(z.enum(GRIEVANCES)).min(1),
    date: z.coerce.date(),
    datePrecision: z.enum(['day', 'month', 'year']).default('day'),
    summary: z.string(),
    quote: z.object({ text: z.string(), lang: z.string().length(2) }).optional(),
    status: z.enum(['established', 'contested']),
    response: z.string().optional(),
    sources: z.array(source).min(1),
  }),
});

export const collections = { entities, products, facts };
