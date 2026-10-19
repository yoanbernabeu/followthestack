export const GRIEVANCE_LABELS: Record<string, string> = {
  racism: 'Racism',
  antisemitism: 'Antisemitism',
  islamophobia: 'Islamophobia',
  lgbtphobia: 'LGBTphobia',
  sexism: 'Sexism & masculinism',
  'anti-immigration': 'Anti-immigration',
  'far-right-support': 'Far-right support',
  'anti-democracy': 'Anti-democracy',
  'surveillance-deportation': 'Surveillance & deportation',
  'press-justice-attacks': 'Attacks on press & justice',
  'violent-rhetoric': 'Violent rhetoric',
  'authoritarian-alignment': 'Authoritarian alignment',
  'far-right-funding': 'Funding the far right',
  'war-crimes-support': 'Support for war crimes',
};

// One distinct, soft hue per grievance, readable on light and dark backgrounds.
export const GRIEVANCE_COLORS: Record<string, string> = {
  racism: 'oklch(0.66 0.15 25)',
  antisemitism: 'oklch(0.68 0.13 55)',
  islamophobia: 'oklch(0.74 0.12 85)',
  lgbtphobia: 'oklch(0.66 0.15 340)',
  sexism: 'oklch(0.64 0.14 310)',
  'anti-immigration': 'oklch(0.62 0.15 5)',
  'far-right-support': 'oklch(0.55 0.14 280)',
  'anti-democracy': 'oklch(0.6 0.12 250)',
  'surveillance-deportation': 'oklch(0.64 0.1 220)',
  'press-justice-attacks': 'oklch(0.68 0.1 190)',
  'violent-rhetoric': 'oklch(0.58 0.17 15)',
  'authoritarian-alignment': 'oklch(0.66 0.09 150)',
  'far-right-funding': 'oklch(0.6 0.11 120)',
  'war-crimes-support': 'oklch(0.5 0.08 30)',
};

export const GRIEVANCE_DESCRIPTIONS: Record<string, string> = {
  racism: 'Statements or actions targeting people because of their race, ethnicity or origin, or documented racial discrimination.',
  antisemitism: 'Statements or actions targeting Jewish people, including antisemitic conspiracy theories and Holocaust denial or minimisation.',
  islamophobia: 'Statements or actions targeting Muslims or Islam as a group.',
  lgbtphobia: 'Statements, policies or actions targeting LGBTQ+ people, including transphobia.',
  sexism: 'Statements, policies or actions demeaning women or excluding them because of their gender, or promoting male dominance, including the "crisis of masculinity" narrative (calls to restore "masculine energy", to re-masculinise institutions or culture).',
  'anti-immigration': 'Hostility to immigrants as a group, calls for mass deportation or "remigration", and related claims.',
  'far-right-support': 'Public support for far-right parties, movements or figures.',
  'anti-democracy': 'Statements or actions against democratic institutions, elections or the rule of law.',
  'surveillance-deportation': 'Building or supplying surveillance or deportation infrastructure targeting people.',
  'press-justice-attacks': 'Attacks on journalists, the press, researchers or judges, including lawsuits meant to silence critics.',
  'violent-rhetoric': 'Glorifying, threatening or calling for violence against people or groups.',
  'authoritarian-alignment': 'Funding, gifting to, or complying with the demands of an authoritarian power in place.',
  'far-right-funding': 'Funding far-right parties, movements or campaigns (for Donald Trump, after January 6, 2021).',
  'war-crimes-support': 'Publicly supporting a leader under an International Criminal Court arrest warrant, or supplying technology used in conduct that an international court or UN body has documented as war crimes, crimes against humanity or genocide.',
};

export const CATEGORY_LABELS: Record<string, string> = {
  'cloud-hosting': 'Cloud & hosting',
  'cdn-dns-security': 'CDN, DNS & security',
  email: 'Email',
  analytics: 'Analytics',
  'auth-identity': 'Auth & identity',
  payments: 'Payments',
  monitoring: 'Monitoring',
  ai: 'AI',
  'dev-tools': 'Dev tools',
  'code-hosting': 'Code hosting & CI',
  'frameworks-libraries': 'Frameworks & libraries',
  databases: 'Databases',
  storage: 'Storage',
  collaboration: 'Collaboration',
  communication: 'Communication',
  'social-media': 'Social media',
  advertising: 'Advertising',
  'crm-marketing': 'CRM & marketing',
  design: 'Design',
  'os-hardware': 'OS & hardware',
  'browser-search': 'Browser & search',
};

export const LINK_LABELS: Record<string, { label: string; hint: string }> = {
  pay: { label: 'You pay', hint: 'Your money goes to this company.' },
  data: { label: 'Your data', hint: 'You entrust this company with your or your users’ data.' },
  depend: { label: 'You depend', hint: 'You don’t pay, but you rely on a project this organisation controls.' },
};

export const ROLE_LABELS: Record<string, string> = {
  'subsidiary-of': 'subsidiary of',
  'owned-by': 'owned by',
  'led-by': 'led by',
  'founded-by': 'founded by',
  'invested-by': 'backed by',
  'board-member': 'board member',
};

export function formatDate(iso: string, precision: 'day' | 'month' | 'year' = 'day') {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions =
    precision === 'year' ? { year: 'numeric' } : precision === 'month' ? { year: 'numeric', month: 'short' } : { year: 'numeric', month: 'short', day: 'numeric' };
  return d.toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
}
