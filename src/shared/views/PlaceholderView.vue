<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import Message from 'primevue/message';
import PageHeader from '@shared/components/PageHeader.vue';

/**
 * Écran d'attente des modules déclarés mais non encore écrits.
 *
 * Ce n'est pas un bouche-trou : la route, ses permissions et son entrée de
 * menu sont réelles et testées. Ce qui manque est la vue. Cela permet de
 * vérifier dès maintenant que la matrice de droits produit la bonne
 * navigation pour chaque rôle, sans attendre que douze écrans existent.
 */

const route = useRoute();
const { t } = useI18n();

const title = computed(() => t(route.meta.titleKey ?? 'placeholder.title'));
const permissions = computed(() =>
  route.matched.flatMap((record) => record.meta.permissions ?? []),
);
const roles = computed(() => route.matched.flatMap((record) => record.meta.roles ?? []));
</script>

<template>
  <div>
    <PageHeader :title="title" :subtitle="t('placeholder.title')" />

    <Message severity="info" :closable="false">{{ t('placeholder.body') }}</Message>

    <dl class="mt-6 grid max-w-xl grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
      <dt class="text-surface-500">{{ t('placeholder.route') }}</dt>
      <dd>
        <code>{{ route.path }}</code>
      </dd>

      <dt class="text-surface-500">{{ t('placeholder.permissions') }}</dt>
      <dd>
        <code v-if="permissions.length">{{ permissions.join(', ') }}</code>
        <span v-else class="text-surface-400">—</span>
      </dd>

      <dt class="text-surface-500">{{ t('placeholder.roles') }}</dt>
      <dd>
        <code v-if="roles.length">{{ roles.join(', ') }}</code>
        <span v-else class="text-surface-400">—</span>
      </dd>
    </dl>
  </div>
</template>
