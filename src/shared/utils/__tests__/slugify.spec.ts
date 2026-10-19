import { describe, expect, it } from 'vitest';
import { slugify } from '../slugify';

describe('slugify', () => {
  it('retire accents et ponctuation, en kebab-case', () => {
    expect(slugify('  À propos de nous ! ')).toBe('a-propos-de-nous');
    expect(slugify('Lancement — cohorte n°1')).toBe('lancement-cohorte-n-1');
  });

  it('coupe à la longueur maximale sans tiret final', () => {
    expect(slugify('abc def', 4)).toBe('abc');
    expect(slugify('x'.repeat(200))).toHaveLength(120);
  });
});
