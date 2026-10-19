<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Tag from 'primevue/tag';
import type { UserStatus } from '../types';

const props = defineProps<{ status: UserStatus }>();
const { t } = useI18n();

const STYLE: Record<
  UserStatus,
  { severity: 'success' | 'warn' | 'danger' | 'secondary'; icon: string }
> = {
  ACTIVE: { severity: 'success', icon: 'pi pi-check-circle' },
  PENDING: { severity: 'warn', icon: 'pi pi-hourglass' },
  SUSPENDED: { severity: 'danger', icon: 'pi pi-ban' },
  DELETED: { severity: 'secondary', icon: 'pi pi-trash' },
};
const style = computed(() => STYLE[props.status]);
</script>

<template>
  <Tag
    :value="t(`users.statuses.${status}`)"
    :severity="style.severity"
    :icon="style.icon"
    :data-status="status"
  />
</template>
