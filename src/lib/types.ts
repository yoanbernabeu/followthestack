export type Source = { url: string; outlet: string; date?: string; archive?: string };

export type Relation = {
  target: string;
  role: 'subsidiary-of' | 'founded-by' | 'led-by' | 'owned-by' | 'invested-by' | 'board-member';
  since?: string;
  until?: string;
  sources: Source[];
};

export type Entity = {
  id: string;
  name: string;
  type: string;
  description: string;
  country?: string;
  website?: string;
  reviewed?: string;
  relations: Relation[];
};

export type Product = {
  id: string;
  name: string;
  vendor: string;
  category: string;
  links: ('pay' | 'data' | 'depend')[];
  description: string;
  website?: string;
  detect: { npm: string[]; composer: string[]; gems: string[]; pypi: string[]; docker: string[] };
  alternatives: string[];
};

export type Fact = {
  id: string;
  subject: string;
  grievances: string[];
  date: string;
  datePrecision: 'day' | 'month' | 'year';
  summary: string;
  quote?: { text: string; lang: string };
  status: 'established' | 'contested';
  response?: string;
  sources: Source[];
};

export type Dataset = {
  products: Product[];
  entities: Record<string, Entity>;
  facts: Fact[];
};
