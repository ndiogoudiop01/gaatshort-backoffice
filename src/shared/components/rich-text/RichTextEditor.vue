<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { EditorContent, useEditor } from '@tiptap/vue-3';
import { BubbleMenu } from '@tiptap/vue-3/menus';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Image } from '@tiptap/extension-image';
import { useEventListener, useScrollLock } from '@vueuse/core';
import {
  readingMinutes,
  SAFE_HREF,
  SAFE_IMAGE_SRC,
  sanitizeByProfile,
  wordCount,
  type RichTextProfile,
} from '@shared/utils/rich-text-policy';

/**
 * Éditeur de texte riche (Tiptap / ProseMirror) — partagé depuis BSG-10.
 *
 * Deux usages : le bloc « texte riche » des pages éditoriales (BSG-9) et le
 * corps des actualités (BSG-10). Il n'y a rien de métier ici : le HTML
 * produit suit la politique de balises de `@shared/utils/rich-text-policy`.
 *
 * Il est chargé en IMPORT DYNAMIQUE par ses appelants : Tiptap forme son
 * propre lot, téléchargé seulement quand un éditeur est affiché.
 *
 * Le SCHÉMA de l'éditeur est la première barrière de la politique de balises :
 * seules les extensions ci-dessous existent, donc seules leurs balises
 * peuvent être produites. Un HTML collé depuis Word ou une page web est
 * réduit à ce schéma par ProseMirror, puis assaini.
 *
 * Ergonomie :
 *  • barre d'outils collante + menu flottant sur la sélection (mise en forme
 *    sans quitter le texte des yeux) ;
 *  • raccourcis Markdown de StarterKit (`## `, `- `, `1. `, `> `, `**x**`) ;
 *  • mode concentration (plein écran, colonne de lecture), `Échap` pour sortir ;
 *  • compteur de mots, temps de lecture et jauge de longueur si `maxLength`.
 *
 * Profil `email` (newsletter, BSG-11) : ajoute l'extension Image et son outil
 * (URL `https://` + texte alternatif obligatoire), et assainit avec la
 * politique e-mail. Le profil `page` (défaut) reste strictement inchangé.
 */

const props = withDefaults(
  defineProps<{
    modelValue: string;
    inputId?: string;
    placeholder?: string;
    invalid?: boolean;
    ariaLabel?: string;
    /** Longueur HTML maximale acceptée par l'API — affiche une jauge. */
    maxLength?: number;
    /** `document` : grande zone d'écriture (article), `block` : encart compact (bloc de page). */
    variant?: 'block' | 'document';
    readonly?: boolean;
    /** `page` (défaut) : pages et actualités. `email` : autorise les images `https://`. */
    profile?: RichTextProfile;
  }>(),
  {
    inputId: undefined,
    placeholder: '',
    ariaLabel: undefined,
    maxLength: undefined,
    variant: 'block',
    readonly: false,
    profile: 'page',
  },
);
const emit = defineEmits<{ 'update:modelValue': [html: string] }>();

const { t } = useI18n();

const clean = (html: string) => sanitizeByProfile(html, props.profile);

const editor = useEditor({
  content: clean(props.modelValue),
  editable: !props.readonly,
  extensions: [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' },
        isAllowedUri: (url) => SAFE_HREF.test(url),
      },
    }),
    Placeholder.configure({ placeholder: () => props.placeholder ?? '' }),
    // Pas de base64 : une image collée en `data:` est refusée dès l'éditeur.
    ...(props.profile === 'email' ? [Image.configure({ inline: false, allowBase64: false })] : []),
  ],
  editorProps: {
    attributes: {
      class: 'rte-content rich-text',
      role: 'textbox',
      'aria-multiline': 'true',
      ...(props.inputId ? { id: props.inputId } : {}),
      ...(props.ariaLabel ? { 'aria-label': props.ariaLabel } : {}),
    },
  },
  onUpdate: ({ editor: instance }) => {
    emit('update:modelValue', instance.isEmpty ? '' : instance.getHTML());
  },
});

// Valeur remplacée de l'extérieur (rechargement, annulation) : on resynchronise.
watch(
  () => props.modelValue,
  (value) => {
    const instance = editor.value;
    if (!instance) return;
    const current = instance.isEmpty ? '' : instance.getHTML();
    if (value !== current) instance.commands.setContent(clean(value), { emitUpdate: false });
  },
);

watch(
  () => props.readonly,
  (readonly) => editor.value?.setEditable(!readonly, false),
);

onBeforeUnmount(() => editor.value?.destroy());

// ─────────────────────────── Barre d'outils ───────────────────────────

type Level = 2 | 3 | 4;

const blockStyle = computed<'paragraph' | Level>(() => {
  const instance = editor.value;
  if (!instance) return 'paragraph';
  for (const level of [2, 3, 4] as const) {
    if (instance.isActive('heading', { level })) return level;
  }
  return 'paragraph';
});

function setBlockStyle(value: string): void {
  const chain = editor.value?.chain().focus();
  if (!chain) return;
  if (value === 'paragraph') chain.setParagraph().run();
  else chain.setHeading({ level: Number(value) as Level }).run();
}

interface Tool {
  readonly key: string;
  readonly icon: string;
  readonly shortcut?: string;
  readonly active?: () => boolean;
  readonly disabled?: () => boolean;
  readonly run: () => void;
}

const chain = () => editor.value!.chain().focus();

const history: Tool[] = [
  {
    key: 'undo',
    icon: 'pi pi-undo',
    shortcut: 'Ctrl+Z',
    disabled: () => !editor.value?.can().undo(),
    run: () => chain().undo().run(),
  },
  {
    key: 'redo',
    icon: 'pi pi-refresh',
    shortcut: 'Ctrl+Shift+Z',
    disabled: () => !editor.value?.can().redo(),
    run: () => chain().redo().run(),
  },
];

const marks: Tool[] = [
  {
    key: 'bold',
    icon: 'rte-glyph-bold',
    shortcut: 'Ctrl+B',
    active: () => !!editor.value?.isActive('bold'),
    run: () => chain().toggleBold().run(),
  },
  {
    key: 'italic',
    icon: 'rte-glyph-italic',
    shortcut: 'Ctrl+I',
    active: () => !!editor.value?.isActive('italic'),
    run: () => chain().toggleItalic().run(),
  },
  {
    key: 'underline',
    icon: 'rte-glyph-underline',
    shortcut: 'Ctrl+U',
    active: () => !!editor.value?.isActive('underline'),
    run: () => chain().toggleUnderline().run(),
  },
  {
    key: 'strike',
    icon: 'rte-glyph-strike',
    shortcut: 'Ctrl+Shift+S',
    active: () => !!editor.value?.isActive('strike'),
    run: () => chain().toggleStrike().run(),
  },
  {
    key: 'code',
    icon: 'pi pi-code',
    shortcut: 'Ctrl+E',
    active: () => !!editor.value?.isActive('code'),
    run: () => chain().toggleCode().run(),
  },
];

const blocks: Tool[] = [
  {
    key: 'bulletList',
    icon: 'pi pi-list',
    shortcut: 'Ctrl+Shift+8',
    active: () => !!editor.value?.isActive('bulletList'),
    run: () => chain().toggleBulletList().run(),
  },
  {
    key: 'orderedList',
    icon: 'rte-glyph-ordered',
    shortcut: 'Ctrl+Shift+7',
    active: () => !!editor.value?.isActive('orderedList'),
    run: () => chain().toggleOrderedList().run(),
  },
  {
    key: 'blockquote',
    icon: 'rte-glyph-quote',
    shortcut: 'Ctrl+Shift+B',
    active: () => !!editor.value?.isActive('blockquote'),
    run: () => chain().toggleBlockquote().run(),
  },
  {
    key: 'codeBlock',
    icon: 'rte-glyph-codeblock',
    shortcut: 'Ctrl+Alt+C',
    active: () => !!editor.value?.isActive('codeBlock'),
    run: () => chain().toggleCodeBlock().run(),
  },
  {
    key: 'horizontalRule',
    icon: 'pi pi-minus',
    run: () => chain().setHorizontalRule().run(),
  },
];

const clearTool: Tool = {
  key: 'clear',
  icon: 'pi pi-eraser',
  run: () => chain().unsetAllMarks().clearNodes().run(),
};

const groups = computed(() => [history, marks, blocks]);

/** Menu flottant : la mise en forme « de phrase » seulement, pas la structure. */
const bubbleTools = marks.filter((tool) => tool.key !== 'code');

function titleOf(tool: Tool): string {
  const label = t(`richText.tools.${tool.key}`);
  return tool.shortcut ? `${label} (${tool.shortcut})` : label;
}

/** Pas de menu flottant sur un bloc de code, ni en lecture seule. */
function shouldShowBubble({
  editor: instance,
}: {
  editor: {
    isActive: (name: string) => boolean;
    isEditable: boolean;
    state: { selection: { empty: boolean } };
  };
}): boolean {
  return instance.isEditable && !instance.state.selection.empty && !instance.isActive('codeBlock');
}

// ─────────────────────────── Lien ───────────────────────────

const linkOpen = ref(false);
const linkValue = ref('');
const linkInput = ref<HTMLInputElement | null>(null);
const linkInvalid = computed(
  () => !!linkValue.value.trim() && !SAFE_HREF.test(linkValue.value.trim()),
);
const linkActive = computed(() => !!editor.value?.isActive('link'));

async function openLink(): Promise<void> {
  if (props.readonly) return;
  linkValue.value = (editor.value?.getAttributes('link').href as string | undefined) ?? '';
  linkOpen.value = true;
  await nextTick();
  linkInput.value?.focus();
}

function applyLink(): void {
  const href = linkValue.value.trim();
  if (!href) return removeLink();
  if (!SAFE_HREF.test(href)) return;
  chain().extendMarkRange('link').setLink({ href }).run();
  linkOpen.value = false;
}

function removeLink(): void {
  chain().extendMarkRange('link').unsetLink().run();
  linkOpen.value = false;
}

function closeLink(): void {
  linkOpen.value = false;
  editor.value?.commands.focus();
}

// ─────────────────────────── Image (profil e-mail) ───────────────────────────

const imageOpen = ref(false);
const imageSrc = ref('');
const imageAlt = ref('');
const imageInput = ref<HTMLInputElement | null>(null);
const imageSrcInvalid = computed(
  () => !!imageSrc.value.trim() && !SAFE_IMAGE_SRC.test(imageSrc.value.trim()),
);
const canInsertImage = computed(
  () => SAFE_IMAGE_SRC.test(imageSrc.value.trim()) && !!imageAlt.value.trim(),
);

async function openImage(): Promise<void> {
  if (props.readonly) return;
  linkOpen.value = false;
  const current = editor.value?.getAttributes('image') ?? {};
  imageSrc.value = (current['src'] as string | undefined) ?? '';
  imageAlt.value = (current['alt'] as string | undefined) ?? '';
  imageOpen.value = true;
  await nextTick();
  imageInput.value?.focus();
}

function applyImage(): void {
  if (!canInsertImage.value) return;
  chain().setImage({ src: imageSrc.value.trim(), alt: imageAlt.value.trim() }).run();
  imageOpen.value = false;
}

function closeImage(): void {
  imageOpen.value = false;
  editor.value?.commands.focus();
}

// ─────────────────────────── Mode concentration ───────────────────────────

const focusMode = ref(false);
const scrollLock = useScrollLock(typeof document === 'undefined' ? null : document.body);

function toggleFocusMode(): void {
  focusMode.value = !focusMode.value;
  scrollLock.value = focusMode.value;
  void nextTick(() => editor.value?.commands.focus());
}

useEventListener(
  typeof window === 'undefined' ? null : window,
  'keydown',
  (event: KeyboardEvent) => {
    if (event.key === 'Escape' && focusMode.value && !linkOpen.value && !imageOpen.value) {
      event.preventDefault();
      toggleFocusMode();
    }
  },
);

onBeforeUnmount(() => {
  scrollLock.value = false;
});

// ─────────────────────────── Compteurs ───────────────────────────

const words = computed(() => wordCount(props.modelValue));
const minutes = computed(() => readingMinutes(props.modelValue));
const characters = computed(() => props.modelValue.length);
const usage = computed(() =>
  props.maxLength ? Math.min(characters.value / props.maxLength, 1) : 0,
);
const usageTone = computed(() => {
  if (!props.maxLength) return '';
  if (characters.value > props.maxLength) return 'rte-meter--over';
  return usage.value > 0.9 ? 'rte-meter--warn' : '';
});
</script>

<template>
  <div
    class="rte"
    :class="[
      `rte--${variant}`,
      { 'rte--invalid': invalid, 'rte--focus': focusMode, 'rte--readonly': readonly },
    ]"
    :role="focusMode ? 'dialog' : undefined"
    :aria-modal="focusMode ? 'true' : undefined"
    :aria-label="focusMode ? t('richText.focusMode') : undefined"
    data-testid="rich-text-editor"
  >
    <div
      v-if="!readonly"
      class="rte-toolbar"
      role="toolbar"
      :aria-label="t('richText.toolbar')"
      :aria-controls="inputId"
    >
      <select
        class="rte-select"
        :value="blockStyle"
        :aria-label="t('richText.tools.style')"
        :disabled="!editor"
        @change="setBlockStyle(($event.target as HTMLSelectElement).value)"
      >
        <option value="paragraph">{{ t('richText.styles.paragraph') }}</option>
        <option :value="2">{{ t('richText.styles.h2') }}</option>
        <option :value="3">{{ t('richText.styles.h3') }}</option>
        <option :value="4">{{ t('richText.styles.h4') }}</option>
      </select>

      <template v-for="(group, index) in groups" :key="index">
        <span class="rte-sep" aria-hidden="true" />
        <button
          v-for="tool in group"
          :key="tool.key"
          type="button"
          class="rte-btn"
          :class="{ 'rte-btn--active': tool.active?.() }"
          :title="titleOf(tool)"
          :aria-label="titleOf(tool)"
          :aria-pressed="tool.active ? !!tool.active() : undefined"
          :disabled="!editor || tool.disabled?.()"
          :data-testid="`rte-${tool.key}`"
          @mousedown.prevent
          @click="tool.run()"
        >
          <i :class="tool.icon" aria-hidden="true" />
        </button>
      </template>

      <span class="rte-sep" aria-hidden="true" />
      <button
        type="button"
        class="rte-btn"
        :class="{ 'rte-btn--active': linkActive || linkOpen }"
        :title="`${t('richText.tools.link')} (Ctrl+K)`"
        :aria-label="t('richText.tools.link')"
        :aria-pressed="linkActive"
        :disabled="!editor"
        data-testid="rte-link"
        @mousedown.prevent
        @click="openLink"
      >
        <i class="pi pi-link" aria-hidden="true" />
      </button>
      <button
        v-if="profile === 'email'"
        type="button"
        class="rte-btn"
        :class="{ 'rte-btn--active': imageOpen || !!editor?.isActive('image') }"
        :title="t('richText.tools.image')"
        :aria-label="t('richText.tools.image')"
        :disabled="!editor"
        data-testid="rte-image"
        @mousedown.prevent
        @click="openImage"
      >
        <i class="pi pi-image" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="rte-btn"
        :title="t(`richText.tools.${clearTool.key}`)"
        :aria-label="t(`richText.tools.${clearTool.key}`)"
        :disabled="!editor"
        @mousedown.prevent
        @click="clearTool.run()"
      >
        <i :class="clearTool.icon" aria-hidden="true" />
      </button>

      <button
        type="button"
        class="rte-btn ml-auto"
        :class="{ 'rte-btn--active': focusMode }"
        :title="`${focusMode ? t('richText.exitFocus') : t('richText.focusMode')}${focusMode ? ' (Échap)' : ''}`"
        :aria-label="focusMode ? t('richText.exitFocus') : t('richText.focusMode')"
        :aria-pressed="focusMode"
        data-testid="rte-focus"
        @click="toggleFocusMode"
      >
        <i
          :class="focusMode ? 'pi pi-window-minimize' : 'pi pi-window-maximize'"
          aria-hidden="true"
        />
      </button>
    </div>

    <Transition name="rte-slide">
      <form
        v-if="linkOpen"
        class="rte-link"
        @submit.prevent="applyLink"
        @keydown.esc.stop="closeLink"
      >
        <i class="pi pi-link text-surface-400" aria-hidden="true" />
        <input
          ref="linkInput"
          v-model="linkValue"
          type="text"
          inputmode="url"
          class="rte-link-input"
          :class="{ 'rte-link-input--invalid': linkInvalid }"
          :placeholder="t('richText.linkPlaceholder')"
          :aria-label="t('richText.tools.link')"
          :aria-invalid="linkInvalid"
          data-testid="rte-link-input"
        />
        <span v-if="linkInvalid" class="text-xs text-red-600">
          {{ t('richText.linkInvalid') }}
        </span>
        <button type="submit" class="rte-link-action" :disabled="linkInvalid">
          {{ t('common.apply') }}
        </button>
        <button v-if="linkActive" type="button" class="rte-link-action" @click="removeLink">
          {{ t('richText.unlink') }}
        </button>
        <button
          type="button"
          class="rte-btn"
          :aria-label="t('common.close')"
          :title="t('common.close')"
          @click="closeLink"
        >
          <i class="pi pi-times" aria-hidden="true" />
        </button>
      </form>
    </Transition>

    <Transition name="rte-slide">
      <!-- Pas de <form> : « Entrée » dans l'URL ne doit rien insérer d'incomplet. -->
      <div
        v-if="imageOpen"
        class="rte-link"
        role="group"
        :aria-label="t('richText.tools.image')"
        data-testid="rte-image-form"
        @keydown.esc.stop="closeImage"
      >
        <i class="pi pi-image text-surface-400" aria-hidden="true" />
        <input
          ref="imageInput"
          v-model="imageSrc"
          type="text"
          inputmode="url"
          class="rte-link-input"
          :class="{ 'rte-link-input--invalid': imageSrcInvalid }"
          :placeholder="t('richText.imageSrcPlaceholder')"
          :aria-label="t('richText.imageSrc')"
          :aria-invalid="imageSrcInvalid"
          data-testid="rte-image-src"
          @keydown.enter.prevent="applyImage"
        />
        <input
          v-model="imageAlt"
          type="text"
          maxlength="200"
          class="rte-link-input"
          :placeholder="t('richText.imageAltPlaceholder')"
          :aria-label="t('richText.imageAlt')"
          data-testid="rte-image-alt"
          @keydown.enter.prevent="applyImage"
        />
        <span v-if="imageSrcInvalid" class="text-xs text-red-600">
          {{ t('richText.imageInvalid') }}
        </span>
        <button
          type="button"
          class="rte-link-action"
          :disabled="!canInsertImage"
          data-testid="rte-image-apply"
          @click="applyImage"
        >
          {{ t('richText.imageInsert') }}
        </button>
        <button
          type="button"
          class="rte-btn"
          :aria-label="t('common.close')"
          :title="t('common.close')"
          @click="closeImage"
        >
          <i class="pi pi-times" aria-hidden="true" />
        </button>
      </div>
    </Transition>

    <BubbleMenu
      v-if="editor && !readonly"
      :editor="editor"
      :should-show="shouldShowBubble"
      :options="{ placement: 'top', offset: 8 }"
      class="rte-bubble"
      data-testid="rte-bubble"
    >
      <button
        v-for="tool in bubbleTools"
        :key="tool.key"
        type="button"
        class="rte-bubble-btn"
        :class="{ 'rte-bubble-btn--active': tool.active?.() }"
        :title="titleOf(tool)"
        :aria-label="titleOf(tool)"
        :aria-pressed="!!tool.active?.()"
        @mousedown.prevent
        @click="tool.run()"
      >
        <i :class="tool.icon" aria-hidden="true" />
      </button>
      <span class="rte-bubble-sep" aria-hidden="true" />
      <button
        type="button"
        class="rte-bubble-btn"
        :class="{ 'rte-bubble-btn--active': linkActive }"
        :title="`${t('richText.tools.link')} (Ctrl+K)`"
        :aria-label="t('richText.tools.link')"
        @mousedown.prevent
        @click="openLink"
      >
        <i class="pi pi-link" aria-hidden="true" />
      </button>
    </BubbleMenu>

    <div class="rte-scroll">
      <EditorContent :editor="editor" class="rte-body" @keydown.ctrl.k.prevent="openLink" />
    </div>

    <footer class="rte-footer" aria-live="polite">
      <span>{{ t('richText.words', words) }}</span>
      <span aria-hidden="true">·</span>
      <span v-if="variant === 'document'">{{ t('richText.readingTime', minutes) }}</span>
      <span v-if="variant === 'document'" aria-hidden="true">·</span>
      <span :class="{ 'font-medium text-red-600': maxLength && characters > maxLength }">
        {{
          maxLength
            ? t('richText.charactersOf', { count: characters, max: maxLength })
            : t('richText.characters', { count: characters })
        }}
      </span>
      <span
        v-if="maxLength"
        class="rte-meter"
        :class="usageTone"
        role="meter"
        :aria-valuenow="characters"
        aria-valuemin="0"
        :aria-valuemax="maxLength"
        :aria-label="t('richText.lengthMeter')"
      >
        <span class="rte-meter-fill" :style="{ transform: `scaleX(${usage})` }" />
      </span>
      <span class="ml-auto hidden md:inline">{{
        profile === 'email'
          ? t('richText.emailHint')
          : variant === 'document'
            ? t('richText.markdownHint')
            : t('richText.policyHint')
      }}</span>
    </footer>
  </div>
</template>

<style scoped>
.rte {
  @apply flex flex-col overflow-hidden rounded-xl border border-surface-200 bg-surface-0 dark:border-surface-700 dark:bg-surface-900;
  transition:
    border-color var(--duration-popover) ease,
    box-shadow var(--duration-popover) ease;
}
.rte:focus-within {
  @apply border-primary-400 ring-4 ring-primary-100 dark:ring-primary-900/40;
}
.rte--invalid {
  @apply border-red-400;
}
.rte--readonly {
  @apply bg-surface-50 dark:bg-surface-900/60;
}

/*
 * Mode concentration : la carte devient une page. Entrée en 220 ms,
 * `--ease-out`, depuis scale(0.985) — jamais depuis 0. Occasionnel, donc
 * animé ; la sortie est instantanée (retour au formulaire, où l'œil est déjà).
 */
.rte--focus {
  @apply fixed inset-0 z-[1100] rounded-none border-0 ring-0;
  animation: rte-focus-in var(--duration-panel) var(--ease-out);
}
.rte--focus:focus-within {
  @apply ring-0;
}
@keyframes rte-focus-in {
  from {
    opacity: 0;
    transform: scale(0.985);
  }
}

.rte-toolbar {
  @apply sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-surface-200 bg-surface-50/95 px-2 py-1.5 backdrop-blur dark:border-surface-700 dark:bg-surface-800/95;
}
.rte--focus .rte-toolbar {
  @apply justify-center px-4 py-2;
}
.rte-select {
  @apply h-8 rounded-md border border-transparent bg-transparent px-2 text-sm font-medium text-surface-700 hover:bg-surface-200/70 focus:border-primary-300 focus:outline-none dark:text-surface-200 dark:hover:bg-surface-700;
}
.rte-sep {
  @apply mx-1 h-5 w-px bg-surface-200 dark:bg-surface-700;
}
.rte-btn {
  @apply inline-flex h-8 w-8 items-center justify-center rounded-md text-sm text-surface-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-400 disabled:cursor-not-allowed disabled:opacity-40 dark:text-surface-300;
  transition:
    background-color var(--duration-press) ease,
    color var(--duration-press) ease,
    transform var(--duration-press) var(--ease-out);
}
.rte-btn:active:not(:disabled) {
  transform: scale(0.94);
}
@media (hover: hover) and (pointer: fine) {
  .rte-btn:hover:not(:disabled) {
    @apply bg-surface-200/70 text-surface-900 dark:bg-surface-700 dark:text-surface-0;
  }
}
.rte-btn--active,
.rte-btn--active:hover {
  @apply bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-200;
}

.rte-link {
  @apply flex flex-wrap items-center gap-2 border-b border-surface-200 bg-surface-0 px-3 py-2 dark:border-surface-700 dark:bg-surface-900;
}
.rte-link-input {
  @apply h-8 min-w-48 flex-1 rounded-md border border-surface-300 bg-transparent px-2 text-sm focus:border-primary-400 focus:outline-none dark:border-surface-600;
}
.rte-link-input--invalid {
  @apply border-red-400;
}
.rte-link-action {
  @apply h-8 rounded-md px-3 text-sm font-medium text-primary-700 hover:bg-primary-50 disabled:opacity-40 dark:text-primary-300 dark:hover:bg-primary-900/40;
}

/* Menu flottant de sélection — sombre, compact, au-dessus du texte. */
.rte-bubble {
  @apply z-[1200] flex items-center gap-0.5 rounded-lg bg-surface-900 p-1 text-surface-0 shadow-lg ring-1 ring-black/10 dark:bg-surface-0 dark:text-surface-900;
  transform-origin: bottom center;
  animation: rte-bubble-in var(--duration-popover) var(--ease-out);
}
@keyframes rte-bubble-in {
  from {
    opacity: 0;
    transform: translateY(2px) scale(0.97);
  }
}
.rte-bubble-btn {
  @apply inline-flex h-7 w-7 items-center justify-center rounded-md text-sm;
  transition:
    background-color var(--duration-press) ease,
    transform var(--duration-press) var(--ease-out);
}
.rte-bubble-btn:active {
  transform: scale(0.94);
}
@media (hover: hover) and (pointer: fine) {
  .rte-bubble-btn:hover {
    @apply bg-white/15 dark:bg-black/10;
  }
}
.rte-bubble-btn--active {
  @apply bg-white/20 text-primary-200 dark:bg-black/10 dark:text-primary-700;
}
.rte-bubble-sep {
  @apply mx-0.5 h-4 w-px bg-white/20 dark:bg-black/15;
}

.rte-scroll {
  @apply flex-1;
}
.rte--focus .rte-scroll {
  @apply overflow-y-auto;
}

.rte-footer {
  @apply flex flex-wrap items-center gap-2 border-t border-surface-100 px-3 py-1.5 text-xs text-surface-500 dark:border-surface-800;
}
.rte--focus .rte-footer {
  @apply justify-center;
}
.rte-meter {
  @apply relative inline-block h-1 w-16 overflow-hidden rounded-full bg-surface-200 dark:bg-surface-700;
}
.rte-meter-fill {
  @apply absolute inset-0 origin-left rounded-full bg-primary-500;
  transition: transform var(--duration-panel) var(--ease-out);
}
.rte-meter--warn .rte-meter-fill {
  @apply bg-amber-500;
}
.rte-meter--over .rte-meter-fill {
  @apply bg-red-500;
}

/* Glyphes typographiques : plus lisibles que des icônes pour B / I / U / S. */
.rte-glyph-bold::before {
  content: 'B';
  @apply font-bold not-italic;
}
.rte-glyph-italic::before {
  content: 'I';
  @apply font-serif italic;
}
.rte-glyph-underline::before {
  content: 'U';
  @apply underline not-italic;
}
.rte-glyph-strike::before {
  content: 'S';
  @apply not-italic line-through;
}
.rte-glyph-ordered::before {
  content: '1.';
  @apply text-xs font-semibold not-italic;
}
.rte-glyph-quote::before {
  content: '\201C';
  @apply font-serif text-lg font-bold not-italic leading-none;
}
.rte-glyph-codeblock::before {
  content: '{ }';
  @apply font-mono text-xs font-semibold not-italic;
}

.rte-slide-enter-active,
.rte-slide-leave-active {
  transition:
    opacity var(--duration-popover) var(--ease-out),
    transform var(--duration-popover) var(--ease-out);
}
.rte-slide-enter-from,
.rte-slide-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* Zone d'écriture : même typographie que le rendu (`SanitizedHtml.vue`). */
.rte-body :deep(.rte-content) {
  @apply min-h-40 px-5 py-4 text-[0.95rem] leading-relaxed text-surface-800 outline-none dark:text-surface-100;
}
.rte--document .rte-body :deep(.rte-content) {
  @apply min-h-[22rem] px-6 py-6 text-[1.02rem] leading-7 sm:px-10;
}
.rte--focus .rte-body :deep(.rte-content) {
  @apply mx-auto min-h-full max-w-[44rem] px-6 py-12 text-[1.08rem] leading-8;
}
.rte-body :deep(.rte-content img) {
  @apply my-2 h-auto max-w-full rounded-lg;
}
.rte-body :deep(.rte-content img.ProseMirror-selectednode) {
  @apply outline outline-2 outline-offset-2 outline-primary-400;
}
.rte-body :deep(.rte-content p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  @apply pointer-events-none float-left h-0 text-surface-400;
}

/* Mouvement réduit : on garde les fondus (compréhension), on retire les déplacements. */
@media (prefers-reduced-motion: reduce) {
  .rte--focus {
    animation-name: rte-fade-in;
  }
  .rte-bubble {
    animation-name: rte-fade-in;
  }
  .rte-btn:active:not(:disabled),
  .rte-bubble-btn:active {
    transform: none;
  }
  .rte-slide-enter-from,
  .rte-slide-leave-to {
    transform: none;
  }
  @keyframes rte-fade-in {
    from {
      opacity: 0;
    }
  }
}
</style>

<style>
/* Typographie partagée du texte riche — éditeur ET aperçu (non scopée à dessein). */
.rich-text > * + * {
  margin-top: 0.75em;
}
.rich-text h2 {
  @apply mt-6 text-xl font-semibold tracking-tight;
}
.rich-text h3 {
  @apply mt-5 text-lg font-semibold;
}
.rich-text h4 {
  @apply mt-4 text-base font-semibold;
}
.rich-text ul {
  @apply list-disc pl-6;
}
.rich-text ol {
  @apply list-decimal pl-6;
}
.rich-text li > p {
  margin: 0;
}
.rich-text blockquote {
  @apply border-l-4 border-primary-300 pl-4 italic text-surface-600 dark:text-surface-300;
}
.rich-text code {
  @apply rounded bg-surface-100 px-1.5 py-0.5 font-mono text-[0.85em] dark:bg-surface-800;
}
.rich-text pre {
  @apply overflow-x-auto rounded-lg bg-surface-900 p-4 font-mono text-sm text-surface-50;
}
.rich-text pre code {
  @apply bg-transparent p-0 text-inherit;
}
.rich-text a {
  @apply font-medium text-primary-600 underline decoration-primary-300 underline-offset-2 dark:text-primary-400;
}
.rich-text img {
  @apply my-3 h-auto max-w-full rounded-lg;
}
.rich-text hr {
  @apply my-6 border-surface-200 dark:border-surface-700;
}
</style>
