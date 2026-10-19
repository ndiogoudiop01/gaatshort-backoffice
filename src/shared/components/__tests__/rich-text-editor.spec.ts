// @vitest-environment jsdom
// Tiptap (ProseMirror) et DOMPurify tournent sous jsdom, plus fidèle que happy-dom.
import { afterEach, describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import fr from '@core/i18n/locales/fr';
import RichTextEditor from '../rich-text/RichTextEditor.vue';

// ProseMirror mesure la sélection ; jsdom ne fait pas de mise en page.
const noRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] });
Range.prototype.getClientRects ??= noRects as never;
Range.prototype.getBoundingClientRect ??= (() => new DOMRect()) as never;
document.elementFromPoint ??= () => null;

async function mountEditor(modelValue: string, profile: 'page' | 'email' = 'page') {
  const wrapper = mount(RichTextEditor, {
    props: { modelValue, inputId: 'rte', profile },
    global: { plugins: [createI18n({ legacy: false, locale: 'fr', messages: { fr } })] },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('RichTextEditor (Tiptap)', () => {
  it('affiche le contenu ASSAINI : un script injecté n’atteint jamais l’éditeur', async () => {
    const wrapper = await mountEditor(
      '<p>Bonjour</p><script>alert(1)</script><img src=x onerror=alert(1)>',
    );
    const content = wrapper.find('.rte-content');
    expect(content.text()).toContain('Bonjour');
    expect(content.html()).not.toMatch(/script|onerror|<img/);
  });

  it('met en gras la sélection depuis la barre d’outils et émet le HTML', async () => {
    const wrapper = await mountEditor('<p>Bonjour</p>');
    // Tout sélectionner, puis « Gras ».
    const editable = wrapper.find('.rte-content').element as HTMLElement;
    editable.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editable);
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    await flushPromises();

    await wrapper.find('[data-testid="rte-bold"]').trigger('click');
    await flushPromises();

    const emitted = wrapper.emitted('update:modelValue');
    expect(emitted?.at(-1)?.[0]).toBe('<p><strong>Bonjour</strong></p>');
  });

  it('refuse un lien javascript: dans la saisie de lien', async () => {
    const wrapper = await mountEditor('<p>Bonjour</p>');
    await wrapper.find('[data-testid="rte-link"]').trigger('click');
    await wrapper.find('[data-testid="rte-link-input"]').setValue('javascript:alert(1)');

    expect(wrapper.find('[data-testid="rte-link-input"]').attributes('aria-invalid')).toBe('true');
    expect(wrapper.text()).toContain(fr.richText.linkInvalid);
  });

  it('se resynchronise quand la valeur change de l’extérieur', async () => {
    const wrapper = await mountEditor('<p>Avant</p>');
    await wrapper.setProps({ modelValue: '<h2>Après</h2>' });
    await flushPromises();
    expect(wrapper.find('.rte-content h2').text()).toBe('Après');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('profil e-mail (BSG-11) : outil image, https exigé et texte alternatif obligatoire', async () => {
    const page = await mountEditor('<p>a</p><img src="https://x.test/i.png" alt="i">');
    expect(page.find('[data-testid="rte-image"]').exists()).toBe(false);
    expect(page.find('.rte-content img').exists()).toBe(false);
    page.unmount();

    const wrapper = await mountEditor('<p>a</p><img src="https://x.test/i.png" alt="i">', 'email');
    expect(wrapper.find('.rte-content img').attributes('src')).toBe('https://x.test/i.png');

    await wrapper.find('[data-testid="rte-image"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="rte-image-src"]').setValue('http://x.test/b.png');
    await wrapper.find('[data-testid="rte-image-alt"]').setValue('B');
    expect(wrapper.find('[data-testid="rte-image-apply"]').attributes('disabled')).toBeDefined();

    await wrapper.find('[data-testid="rte-image-src"]').setValue('https://x.test/b.png');
    await wrapper.find('[data-testid="rte-image-alt"]').setValue('');
    expect(wrapper.find('[data-testid="rte-image-apply"]').attributes('disabled')).toBeDefined();

    await wrapper.find('[data-testid="rte-image-alt"]').setValue('Photo B');
    await wrapper.find('[data-testid="rte-image-apply"]').trigger('click');
    await flushPromises();
    expect(String(wrapper.emitted('update:modelValue')?.at(-1)?.[0])).toContain(
      '<img src="https://x.test/b.png" alt="Photo B">',
    );
  });
});
