<script setup lang="ts">
import { computed } from 'vue';
import { sanitizeEmailHtml, sanitizeRichText } from '@shared/utils/rich-text-policy';

/**
 * SEUL composant du back-office autorisé à utiliser `v-html` (BSG-9, partagé depuis BSG-10).
 *
 * Le HTML reçu — venu de l'API ou de l'éditeur — passe TOUJOURS par
 * `sanitizeRichText()` (DOMPurify + politique de balises explicite) avant
 * d'être injecté. La règle ESLint `vue/no-v-html` est en erreur partout
 * ailleurs : tout autre usage casse la CI.
 */
const props = withDefaults(
  defineProps<{
    html: string;
    /** `email` (newsletter, BSG-11) autorise en plus les images `https://`. */
    profile?: 'page' | 'email';
  }>(),
  { profile: 'page' },
);

const safe = computed(() =>
  props.profile === 'email' ? sanitizeEmailHtml(props.html) : sanitizeRichText(props.html),
);
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- contenu assaini juste au-dessus -->
  <div class="rich-text" v-html="safe" />
</template>
