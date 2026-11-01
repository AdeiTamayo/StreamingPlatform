import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';

// package.json is "type": "module", so Vercel compiles api/*.ts to ESM JS and
// keeps import specifiers as written. Node's ESM loader refuses extensionless
// relative imports, so a function whose import chain has one fails at runtime
// with ERR_MODULE_NOT_FOUND (FUNCTION_INVOCATION_FAILED) even though tsc, vite
// and vitest all pass. This walks each function's local import chain.

const ROOT = resolve(__dirname, '../..');
const ENTRY_POINTS = ['api/probe.ts', 'api/delete-account.ts', 'api/omdb.ts'];
const RELATIVE_IMPORT = /(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]|import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;

// Assertions use POSIX paths; Windows would otherwise report `src\api\...`.
function repoPath(file: string): string {
  return relative(ROOT, file).replaceAll('\\', '/');
}

function localImports(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(RELATIVE_IMPORT)].map((m) => m[1] ?? m[2]);
}

function walk(entry: string): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  const queue = [resolve(ROOT, entry)];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    const specs = localImports(file);
    seen.set(file, specs);
    for (const spec of specs) {
      const target = resolve(dirname(file), spec.replace(/\.js$/, '.ts'));
      if (existsSync(target)) queue.push(target);
    }
  }
  return seen;
}

describe('Vercel function import chains', () => {
  it.each(ENTRY_POINTS)('%s uses explicit .js extensions on every relative import', (entry) => {
    const offenders: string[] = [];
    for (const [file, specs] of walk(entry)) {
      for (const spec of specs) {
        if (!/\.js$/.test(spec)) offenders.push(`${repoPath(file)} -> ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('actually follows the chain (guards against a vacuous pass)', () => {
    const files = [...walk('api/delete-account.ts').keys()].map(repoPath);
    expect(files).toEqual(
      expect.arrayContaining([
        'api/delete-account.ts',
        'src/api/deleteAccountCore.ts',
        'src/utils/authProviders.ts',
      ]),
    );
    const probe = [...walk('api/probe.ts').keys()].map(repoPath);
    expect(probe).toEqual(expect.arrayContaining(['src/api/providerProbeCore.ts', 'src/api/sources.ts']));
  });
});
