<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';

/**
 * « La modification prendra effet à la prochaine connexion » (BSG-12).
 *
 * Les droits (rôles, permissions, périmètre pays) sont FIGÉS dans le jeton
 * d'accès. Changer un rôle ne change rien pour une personne déjà connectée
 * tant que son jeton n'est pas renouvelé : l'écran le dit, au lieu de laisser
 * croire à un effet immédiat. Deux sorties explicites :
 *  • pour quelqu'un d'autre : « Déconnecter partout » (révoque ses sessions) ;
 *  • pour soi : « Appliquer maintenant » (renouvelle son propre jeton).
 *
 * `pending` : une modification vient d'être enregistrée — le message passe
 * d'une information générale à un avertissement ciblé.
 */
defineProps<{
  pending: boolean;
  isSelf?: boolean;
  /** Nom de la personne, ou « les N comptes » pour un profil. */
  who: string;
  sessions?: number;
  busy?: boolean;
  canAct?: boolean;
}>();
const emit = defineEmits<{ revoke: []; refreshSelf: [] }>();

const { t } = useI18n();
</script>

<template>
  <div
    class="notice"
    :class="{ 'notice--pending': pending }"
    role="status"
    aria-live="polite"
    data-testid="token-effect-notice"
    :data-pending="pending"
  >
    <span class="notice-icon" aria-hidden="true">
      <i :class="pending ? 'pi pi-clock' : 'pi pi-key'" />
    </span>
    <div class="min-w-0 flex-1">
      <p class="font-medium">
        {{ pending ? t('users.effect.pendingTitle') : t('users.effect.title') }}
      </p>
      <p class="mt-0.5 text-sm opacity-90">
        {{ isSelf ? t('users.effect.bodySelf') : t('users.effect.body', { who }) }}
      </p>
    </div>
    <template v-if="canAct">
      <Button
        v-if="isSelf"
        :label="t('users.effect.applyNow')"
        icon="pi pi-refresh"
        size="small"
        :severity="pending ? 'warn' : 'secondary'"
        outlined
        :loading="busy"
        data-testid="apply-self"
        @click="emit('refreshSelf')"
      />
      <Button
        v-else-if="sessions !== 0"
        :label="t('users.effect.revoke')"
        icon="pi pi-sign-out"
        size="small"
        :severity="pending ? 'warn' : 'secondary'"
        outlined
        :loading="busy"
        data-testid="revoke-sessions"
        @click="emit('revoke')"
      />
    </template>
  </div>
</template>

<style scoped>
.notice {
  @apply flex flex-wrap items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100;
  transition:
    background-color var(--duration-panel) var(--ease-out),
    border-color var(--duration-panel) var(--ease-out),
    color var(--duration-panel) var(--ease-out);
}
.notice--pending {
  @apply border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100;
}
.notice-icon {
  @apply inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/70 dark:bg-black/20;
}
</style>
