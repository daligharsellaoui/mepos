<template>
  <PageContainer
    title="Prévisions & Analyse"
    subtitle="Anticipez les besoins en stock grâce aux prévisions basées sur l'historique des ventes."
  >
    <ForecastPanel
      :forecast="app.forecast"
      :is-loading="app.isForecastLoading"
    />
  </PageContainer>
</template>

<script setup>
import { useAppStore } from '../stores/app'
import PageContainer from '../components/base/PageContainer.vue'
import ForecastPanel from '../components/forecast/ForecastPanel.vue'

const app = useAppStore()
</script>
