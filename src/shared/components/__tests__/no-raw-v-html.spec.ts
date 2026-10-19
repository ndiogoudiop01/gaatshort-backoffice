import { describe, expect, it } from 'vitest';

/**
 * Garde-fou BSG-9 : aucun `v-html` dans le back-office, sauf dans
 * `SanitizedHtml.vue`, qui assainit avant d'injecter. Double la règle ESLint
 * `vue/no-v-html` : un `eslint-disable` ajouté ailleurs ne passerait pas ici.
 */
const sources = import.meta.glob('/src/**/*.vue', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('v-html', () => {
  it('n’apparaît que dans SanitizedHtml.vue', () => {
    const offenders = Object.entries(sources)
      .filter(([, code]) => /\bv-html\s*=/.test(code))
      .map(([path]) => path);
    expect(offenders).toEqual(['/src/shared/components/rich-text/SanitizedHtml.vue']);
    expect(Object.keys(sources).length).toBeGreaterThan(10);
  });

  it('SanitizedHtml.vue passe bien par l’assainisseur', () => {
    const code = sources['/src/shared/components/rich-text/SanitizedHtml.vue'] ?? '';
    expect(code).toContain('sanitizeRichText(props.html)');
    // Profil e-mail (BSG-11) : même composant, liste + `img` https.
    expect(code).toContain('sanitizeEmailHtml(props.html)');
    expect(code).toContain('v-html="safe"');
  });
});
