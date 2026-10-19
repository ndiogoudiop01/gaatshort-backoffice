<script setup lang="ts">
import Toast from 'primevue/toast';
import ConfirmDialog from 'primevue/confirmdialog';
</script>

<template>
  <!--
    Les deux services globaux de PrimeVue sont montés une seule fois, ici :
    `Toast` et `ConfirmDialog` sont des points d'ancrage uniques. Les déclarer
    dans chaque écran empilerait plusieurs conteneurs et les notifications
    s'afficheraient en double.
  -->
  <Toast position="bottom-right" />
  <ConfirmDialog />

  <RouterView />
</template>
