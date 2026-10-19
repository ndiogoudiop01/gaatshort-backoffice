/**
 * « À propos de nous ! » → `a-propos-de-nous`.
 *
 * Partagé depuis BSG-10 : pages éditoriales et actualités proposent toutes
 * deux un slug à partir du titre. Même contrainte que les DTO backend :
 * kebab-case, 120 caractères au plus.
 */
export function slugify(value: string, max = 120): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}
