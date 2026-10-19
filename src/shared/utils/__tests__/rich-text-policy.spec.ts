// @vitest-environment jsdom
// DOMPurify est faux sous happy-dom (il y conserve `onclick` et `<script>`) :
// les specs qui assainissent du HTML tournent sous jsdom, comme DOMPurify lui-même.
import { describe, expect, it } from 'vitest';
import {
  plainText,
  readingMinutes,
  SAFE_HREF,
  sanitizeRichText,
  wordCount,
} from '../rich-text-policy';

describe('politique de balises du texte riche (BSG-9)', () => {
  it('conserve la mise en forme autorisée', () => {
    const html =
      '<h2>Titre</h2><p><strong>gras</strong> <em>it</em> <u>s</u> <s>b</s> <code>x</code></p><ul><li><p>a</p></li></ul><ol start="3"><li>b</li></ol><blockquote><p>c</p></blockquote><pre><code>code</code></pre><hr>';
    expect(sanitizeRichText(html)).toBe(html);
  });

  it('retire scripts, iframes, images, styles, classes et gestionnaires d’événements', () => {
    const dirty =
      '<p style="color:red" class="x" onclick="steal()">ok</p><script>alert(1)</script><iframe src="https://evil"></iframe><img src=x onerror=alert(1)><h1>titre</h1><svg><circle/></svg>';
    const clean = sanitizeRichText(dirty);
    expect(clean).toBe('<p>ok</p>titre');
    expect(clean).not.toMatch(/script|onerror|onclick|style|class|iframe|img|svg/i);
  });

  it('neutralise les liens javascript:, data:, vbscript: et //hote', () => {
    for (const href of [
      'javascript:alert(1)',
      ' JaVaScRiPt:alert(1)',
      'data:text/html,<b>x</b>',
      'vbscript:x',
      '//evil.com',
    ]) {
      expect(sanitizeRichText(`<a href="${href}">x</a>`)).toBe('<a>x</a>');
    }
  });

  it('garde http(s), mailto et les chemins internes', () => {
    for (const href of ['https://kaay.org', 'mailto:contact@kaay.org', '/candidater']) {
      expect(sanitizeRichText(`<a href="${href}">x</a>`)).toBe(`<a href="${href}">x</a>`);
    }
  });

  it('impose rel sur target=_blank et retire les autres target', () => {
    expect(sanitizeRichText('<a href="https://a.b" target="_blank" rel="opener">x</a>')).toBe(
      '<a href="https://a.b" target="_blank" rel="noopener noreferrer nofollow">x</a>',
    );
    expect(sanitizeRichText('<a href="https://a.b" target="_top">x</a>')).toBe(
      '<a href="https://a.b">x</a>',
    );
  });

  it('extrait le texte visible', () => {
    expect(plainText('<p>Bonjour <strong>le</strong></p><p>monde</p>')).toBe('Bonjour le monde');
    expect(plainText('<p></p><p> </p>')).toBe('');
  });

  it('compte les mots et estime le temps de lecture (BSG-10)', () => {
    expect(wordCount('<p>Un deux</p><p>trois</p>')).toBe(3);
    expect(wordCount('')).toBe(0);
    expect(readingMinutes('')).toBe(0);
    expect(readingMinutes('<p>court</p>')).toBe(1);
    expect(readingMinutes(`<p>${'mot '.repeat(660)}</p>`)).toBe(3);
  });

  it('SAFE_HREF : http(s), mailto et chemins internes seulement', () => {
    for (const ok of ['https://a.b', 'mailto:x@y.z', '/candidater'])
      expect(SAFE_HREF.test(ok)).toBe(true);
    for (const ko of ['javascript:alert(1)', '//evil.com', 'ftp://a.b'])
      expect(SAFE_HREF.test(ko)).toBe(false);
  });
});

describe('profil e-mail (BSG-11)', () => {
  it('ajoute les images https, et seulement elles', async () => {
    const { sanitizeEmailHtml } = await import('../rich-text-policy');
    expect(
      sanitizeEmailHtml('<p>a</p><img src="https://x.test/i.png" alt="i" width="9" onerror="x()">'),
    ).toBe('<p>a</p><img src="https://x.test/i.png" alt="i">');
    for (const src of [
      'http://x.test/i.png',
      'data:image/png;base64,AAA',
      '/local.png',
      '//x.test/i.png',
      'javascript:x',
    ]) {
      expect(sanitizeEmailHtml(`<p>a</p><img src="${src}">`)).toBe('<p>a</p>');
    }
  });

  it('le profil page reste inchangé : aucune image', () => {
    expect(sanitizeRichText('<img src="https://x.test/i.png" alt="i">')).toBe('');
  });
});
