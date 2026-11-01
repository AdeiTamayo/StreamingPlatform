import { describe, it, expect } from 'vitest';
import en from '../../locales/en/translation.json';
import es from '../../locales/es/translation.json';
import eu from '../../locales/eu/translation.json';

function flatten(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    flatten(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe('locale key parity', () => {
  const enKeys = flatten(en).sort();
  it('es has exactly the keys of en', () => {
    expect(flatten(es).sort()).toEqual(enKeys);
  });
  it('eu has exactly the keys of en', () => {
    expect(flatten(eu).sort()).toEqual(enKeys);
  });
});
