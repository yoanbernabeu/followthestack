export const REPO_URL = 'https://github.com/yoanbernabeu/followthestack';

// GitHub issue forms can be prefilled through the query string: each field id becomes a parameter.
export function issueUrl(template: string, title: string, fields: Record<string, string>) {
  const params = new URLSearchParams({ template, title });
  for (const [k, v] of Object.entries(fields)) if (v.trim()) params.set(k, v.trim());
  return `${REPO_URL}/issues/new?${params.toString()}`;
}

let stars: Promise<number | null> | undefined;

/** Stars on GitHub, fetched once per build, never from the reader's browser. Null when GitHub does not answer. */
export function starCount(): Promise<number | null> {
  const token = process.env.GITHUB_TOKEN; // set in CI, where anonymous calls share a rate limit
  stars ??= fetch('https://api.github.com/repos/yoanbernabeu/followthestack', {
    headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(5000),
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (typeof j?.stargazers_count === 'number' ? j.stargazers_count : null))
    .catch(() => null);
  return stars;
}
