export const REPO_URL = 'https://github.com/yoanbernabeu/followthestack';

// GitHub issue forms can be prefilled through the query string: each field id becomes a parameter.
export function issueUrl(template: string, title: string, fields: Record<string, string>) {
  const params = new URLSearchParams({ template, title });
  for (const [k, v] of Object.entries(fields)) if (v.trim()) params.set(k, v.trim());
  return `${REPO_URL}/issues/new?${params.toString()}`;
}
