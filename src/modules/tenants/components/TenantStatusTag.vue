<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Tag from 'primevue/tag';
import type { TenantStatus } from '../types';

const props = defineProps<{ status: TenantStatus }>();
const { t } = useI18n();

const STYLE: Record<TenantStatus, { severity: 'success' | 'danger' | 'secondary'; icon: string }> =
  {
    ACTIVE: { severity: 'success', icon: 'pi pi-check-circle' },
    SUSPENDED: { severity: 'danger', icon: 'pi pi-pause-circle' },
    ARCHIVED: { severity: 'secondary', icon: 'pi pi-inbox' },
  };
const style = computed(() => STYLE[props.status]);
</script>

<template>
  <Tag
    :value="t(`tenants.statuses.${status}`)"
    :severity="style.severity"
    :icon="style.icon"
    :data-status="status"
  />
</template>
