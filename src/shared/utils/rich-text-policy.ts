import DOMPurify from 'dompurify';

/**
 * Politique de balises du texte riche — décidée EXPLICITEMENT.
 *
 * Deux usages depuis BSG-10, d'où sa place dans `@shared` : le bloc `richText`
 * des pages éditoriales (BSG-9) et le corps des actualités (BSG-10). Le HTML
 * est rendu par le site public ; il est donc assaini :
 *  • ici, AVANT l'envoi (le payload est ce que le backend enregistrera) ;
 *  • ici encore, AVANT tout affichage dans le back-office (`SanitizedHtml.vue`,
 *    seul composant autorisé à utiliser `v-html`) ;
 *  • côté backend, à l'enregistrement (`sanitize-html`, MÊME liste), car
 *    une API ne fait jamais confiance à son client.
 *
 * Tout ce qui n'est pas listé disparaît. Aucun `style`, aucune `class`, aucun
 * `on*`, aucune image, aucun `iframe` : la mise en forme vient du site, pas
 * du contenu. L'éditeur (Tiptap) ne SAIT produire que ces balises-là : son
 * schéma et cette liste doivent rester alignés.
 *
 * Miroirs backend (MÊME liste, toute modification se fait partout) :
 *  • `src/modules/cms/domain/services/rich-text-policy.ts` (pages) ;
 *  • `src/modules/news/domain/services/news-body-policy.ts` (actualités).
 */

/**
 * Lien autorisé : `https://`, `http://`, `mailto:` ou chemin interne `/…`.
 * MÊME expression que `SAFE_HREF` côté backend.
 */
export const SAFE_HREF = /^(https?:\/\/[^\s]+|mailto:[^\s]+|\/(?!\/)[^\s]*)$/i;
export const RICH_TEXT_ALLOWED_TAGS = [
  'p',
  'br',
  'h2',
  'h3',
  'h4',
  'strong',
  'em',
  'u',
  's',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
  'a',
  'hr',
] as const;

export const RICH_TEXT_ALLOWED_ATTRIBUTES = ['href', 'target', 'rel', 'start'] as const;

/**
 * Schémas d'URL autorisés : http(s) et mailto ; toute valeur SANS schéma
 * (chemin `/…`, `_blank`, `3`) passe aussi. Attention : DOMPurify applique
 * cette expression à la valeur de TOUS les attributs non listés comme sûrs,
 * pas seulement à `href` — d'où le motif calqué sur son défaut, restreint
 * aux deux schémas autorisés. Les liens `//hote` sont retirés par le hook.
 */
const ALLOWED_URI = /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

let hooked = false;

function installHooks(): void {
  if (hooked) return;
  hooked = true;
  // Un lien : `target` limité à `_blank`, et alors `rel` imposé (pas de `window.opener`).
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    // Image (profil e-mail seulement, BSG-11) : `https://` exclusivement. Une
    // source `http:`, `data:` ou relative fait disparaître l'image entière.
    if (node.tagName === 'IMG' && !SAFE_IMAGE_SRC.test(node.getAttribute('src') ?? '')) {
      node.remove();
      return;
    }
    if (node.tagName !== 'A') {
      node.removeAttribute('target');
      node.removeAttribute('rel');
      return;
    }
    // `//hote.externe` : lien vers un autre site déguisé en chemin interne.
    if (/^\s*\/\//.test(node.getAttribute('href') ?? '')) node.removeAttribute('href');
    if (node.getAttribute('target') === '_blank') {
      node.setAttribute('rel', 'noopener noreferrer nofollow');
    } else {
      node.removeAttribute('target');
      node.removeAttribute('rel');
    }
  });
}

/**
 * Profil « e-mail » (newsletter, BSG-11) : la liste ci-dessus + `img`.
 *
 * Dans un e-mail, la mise en forme ne peut pas « venir du site » : l'image est
 * le seul enrichissement ajouté. Source `https://` UNIQUEMENT — `http` est
 * bloqué par les webmails, `data:` alourdit le message au point de le faire
 * tronquer (Gmail coupe au-delà de 102 Ko). Aucun `style`, aucune `class`,
 * aucune dimension : le gabarit d'envoi borne la largeur.
 *
 * Miroir backend : `src/modules/marketing/domain/services/newsletter-body-policy.ts`.
 */
export const SAFE_IMAGE_SRC = /^https:\/\/[^\s]+$/i;
export const EMAIL_ALLOWED_TAGS = [...RICH_TEXT_ALLOWED_TAGS, 'img'] as const;
export const EMAIL_ALLOWED_ATTRIBUTES = [...RICH_TEXT_ALLOWED_ATTRIBUTES, 'src', 'alt'] as const;

export function sanitizeEmailHtml(html: string): string {
  installHooks();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [...EMAIL_ALLOWED_TAGS],
    ALLOWED_ATTR: [...EMAIL_ALLOWED_ATTRIBUTES],
    ALLOWED_URI_REGEXP: ALLOWED_URI,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    FORBID_CONTENTS: ['script', 'style', 'textarea', 'noscript', 'iframe', 'object', 'template'],
  }).trim();
}

export type RichTextProfile = 'page' | 'email';

export function sanitizeByProfile(html: string, profile: RichTextProfile): string {
  return profile === 'email' ? sanitizeEmailHtml(html) : sanitizeRichText(html);
}

export function sanitizeRichText(html: string): string {
  installHooks();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [...RICH_TEXT_ALLOWED_TAGS],
    ALLOWED_ATTR: [...RICH_TEXT_ALLOWED_ATTRIBUTES],
    ALLOWED_URI_REGEXP: ALLOWED_URI,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    // Contenu des balises dangereuses supprimé, pas conservé en texte.
    FORBID_CONTENTS: ['script', 'style', 'textarea', 'noscript', 'iframe', 'object', 'template'],
  }).trim();
}

/** Texte visible d'un HTML (compteur de mots, détection d'un bloc vide). */
export function plainText(html: string): string {
  const container = document.createElement('div');
  // Espace après chaque fin de bloc : « <p>un</p><p>deux</p> » fait deux mots, pas « undeux ».
  container.innerHTML = sanitizeRichText(html).replace(
    /<\/(p|h[2-4]|li|blockquote|pre)>|<br\s*\/?>/g,
    '$& ',
  );
  return (container.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function wordCount(html: string): number {
  const text = plainText(html);
  return text ? text.split(' ').length : 0;
}

/** Vitesse de lecture retenue pour l'estimation affichée (mots par minute). */
export const READING_WORDS_PER_MINUTE = 220;

/** Temps de lecture estimé, en minutes entières — 0 pour un texte vide, 1 au minimum sinon. */
export function readingMinutes(html: string): number {
  const words = wordCount(html);
  return words ? Math.max(1, Math.round(words / READING_WORDS_PER_MINUTE)) : 0;
}
