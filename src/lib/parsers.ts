// Parse dependency manifests entirely in the browser. Nothing is uploaded anywhere.
export type Ecosystem = 'npm' | 'composer' | 'gems' | 'pypi' | 'docker';
export type Detected = Record<Ecosystem, Set<string>>;

export const SUPPORTED_FILES = [
  'package.json',
  'composer.json',
  'composer.lock',
  'Gemfile',
  'Gemfile.lock',
  'requirements.txt',
  'pyproject.toml',
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
];

const IGNORED_DIRS = /(^|\/)(node_modules|vendor|\.git|dist|build|\.venv|venv)\//;

export function isSupported(path: string) {
  if (IGNORED_DIRS.test(path)) return false;
  const base = path.split('/').pop() ?? '';
  return SUPPORTED_FILES.includes(base) || /^requirements.*\.txt$/.test(base) || /^Dockerfile/.test(base);
}

export function emptyDetected(): Detected {
  return { npm: new Set(), composer: new Set(), gems: new Set(), pypi: new Set(), docker: new Set() };
}

const normPy = (n: string) => n.trim().toLowerCase().replace(/[_.]+/g, '-');

function normImage(ref: string) {
  let img = ref.trim().replace(/^["']|["']$/g, '').split('@')[0];
  // strip registry host (contains a dot or a port) and tag
  const parts = img.split('/');
  if (parts.length > 1 && /[.:]/.test(parts[0]) && parts[0] !== 'localhost') parts.shift();
  img = parts.join('/').split(':')[0].replace(/^library\//, '');
  return img.toLowerCase();
}

export function parseFile(path: string, text: string, into: Detected) {
  const base = path.split('/').pop() ?? '';
  try {
    if (base === 'package.json') {
      const j = JSON.parse(text);
      for (const k of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'])
        Object.keys(j[k] ?? {}).forEach((n) => into.npm.add(n.toLowerCase()));
    } else if (base === 'composer.json') {
      const j = JSON.parse(text);
      for (const k of ['require', 'require-dev'])
        Object.keys(j[k] ?? {})
          .filter((n) => n.includes('/'))
          .forEach((n) => into.composer.add(n.toLowerCase()));
    } else if (base === 'composer.lock') {
      const j = JSON.parse(text);
      for (const k of ['packages', 'packages-dev']) (j[k] ?? []).forEach((p: { name: string }) => into.composer.add(p.name.toLowerCase()));
    } else if (base === 'Gemfile') {
      for (const m of text.matchAll(/^\s*gem\s+["']([^"']+)["']/gm)) into.gems.add(m[1].toLowerCase());
    } else if (base === 'Gemfile.lock') {
      for (const m of text.matchAll(/^ {4}([a-zA-Z0-9_.-]+) \(/gm)) into.gems.add(m[1].toLowerCase());
    } else if (/^requirements.*\.txt$/.test(base)) {
      for (const line of text.split('\n')) {
        const l = line.split('#')[0].trim();
        if (!l || l.startsWith('-')) continue;
        const m = l.match(/^([A-Za-z0-9_.-]+)/);
        if (m) into.pypi.add(normPy(m[1]));
      }
    } else if (base === 'pyproject.toml') {
      let section = '';
      for (const raw of text.split('\n')) {
        const line = raw.trim();
        const sec = line.match(/^\[([^\]]+)\]/);
        if (sec) { section = sec[1]; continue; }
        if (/dependencies/.test(section) && /^[A-Za-z0-9_.-]+\s*=/.test(line) && !line.startsWith('python')) {
          into.pypi.add(normPy(line.split('=')[0]));
        }
      }
      for (const block of text.matchAll(/dependencies\s*=\s*\[([\s\S]*?)\]/g)) {
        for (const m of block[1].matchAll(/["']\s*([A-Za-z0-9_.-]+)/g)) into.pypi.add(normPy(m[1]));
      }
    } else if (/^Dockerfile/.test(base)) {
      for (const m of text.matchAll(/^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)/gim)) if (!/^\$/.test(m[1]) && m[1].toLowerCase() !== 'scratch') into.docker.add(normImage(m[1]));
    } else if (/compose\.ya?ml$/.test(base)) {
      for (const m of text.matchAll(/^\s*image:\s*(\S+)/gm)) into.docker.add(normImage(m[1]));
    }
  } catch {
    // Malformed file: ignore, the UI reports it.
    return false;
  }
  return true;
}
