<template>
  <PageContainer
    title="Paramètres du Restaurant"
    subtitle="Configurez les paramètres généraux de votre établissement."
  >
    <template #actions>
      <button class="touch-btn" @click="saveAll" :disabled="isSaving" style="min-height: 40px;">
        {{ isSaving ? 'Enregistrement...' : 'Enregistrer' }}
      </button>
    </template>

    <div v-if="isLoading" style="text-align: center; padding: 3rem; color: var(--text-secondary);">
      <div class="spinner" style="margin: 0 auto 1rem;" />
      <p>Chargement des paramètres...</p>
    </div>

    <div v-else style="display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 1.25rem;">
      <!-- Restaurant Info -->
      <div class="glass-panel" style="padding: 1.5rem;">
        <h2 style="font-size: 1rem; font-weight: 700; margin: 0 0 1rem; color: var(--text-primary);">🏪 Informations du Restaurant</h2>
        <div class="form-group">
          <label class="form-label">Nom du restaurant</label>
          <input v-model="settings.restaurant.name" type="text" class="form-input" />
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
          <div class="form-group">
            <label class="form-label">Devise</label>
            <select v-model="settings.restaurant.currency" class="form-select">
              <option value="EUR">EUR (€)</option>
              <option value="TND">TND (د.ت)</option>
              <option value="USD">USD ($)</option>
              <option value="GBP">GBP (£)</option>
              <option value="MAD">MAD (د.م.)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Fuseau horaire</label>
            <select v-model="settings.restaurant.timezone" class="form-select">
              <option value="Europe/Paris">Europe/Paris</option>
              <option value="Africa/Tunis">Africa/Tunis</option>
              <option value="Africa/Casablanca">Africa/Casablanca</option>
              <option value="UTC">UTC</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Langue</label>
          <select v-model="settings.restaurant.language" class="form-select">
            <option value="fr">Français</option>
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </div>
      </div>

      <!-- Notification Settings -->
      <div class="glass-panel" style="padding: 1.5rem;">
        <h2 style="font-size: 1rem; font-weight: 700; margin: 0 0 1rem; color: var(--text-primary);">🔔 Notifications</h2>
        <div class="form-group">
          <label class="form-label" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
            <input type="checkbox" v-model="notifications.lowStockAlerts" />
            Alertes de stock bas
          </label>
        </div>
        <div class="form-group">
          <label class="form-label" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
            <input type="checkbox" v-model="notifications.lossAlerts" />
            Alertes de pertes
          </label>
        </div>
        <div class="form-group">
          <label class="form-label" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
            <input type="checkbox" v-model="notifications.transferUpdates" />
            Mises à jour des transferts
          </label>
        </div>
        <div class="form-group">
          <label class="form-label">Seuil d'alerte stock (défaut)</label>
          <input v-model.number="notifications.defaultAlertThreshold" type="number" min="0" class="form-input" />
        </div>
      </div>

      <!-- Inventory Settings -->
      <div class="glass-panel" style="padding: 1.5rem;">
        <h2 style="font-size: 1rem; font-weight: 700; margin: 0 0 1rem; color: var(--text-primary);">📦 Inventaire</h2>
        <div class="form-group">
          <label class="form-label" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
            <input type="checkbox" v-model="inventory.enableLosses" />
            Activer le suivi des pertes
          </label>
        </div>
        <div class="form-group">
          <label class="form-label" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
            <input type="checkbox" v-model="inventory.enableTransfers" />
            Activer les transferts de stock
          </label>
        </div>
        <div class="form-group">
          <label class="form-label" style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
            <input type="checkbox" v-model="inventory.enableForecasting" />
            Activer les prévisions
          </label>
        </div>
      </div>

      <!-- Sync Settings -->
      <div class="glass-panel" style="padding: 1.5rem;">
        <h2 style="font-size: 1rem; font-weight: 700; margin: 0 0 1rem; color: var(--text-primary);">🔄 Synchronisation</h2>
        <div class="form-group">
          <label class="form-label">Intervalle de synchronisation (secondes)</label>
          <input v-model.number="sync.pollingInterval" type="number" min="5" max="300" class="form-input" />
        </div>
        <div class="form-group">
          <label class="form-label">Taille maximale des lots</label>
          <input v-model.number="sync.maxBatchSize" type="number" min="1" max="500" class="form-input" />
        </div>
        <div class="form-group">
          <label class="form-label">Tentatives maximales</label>
          <input v-model.number="sync.maxRetries" type="number" min="1" max="20" class="form-input" />
        </div>
      </div>
    </div>
  </PageContainer>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue'
import { api } from '../api'
import PageContainer from '../components/base/PageContainer.vue'

const isLoading = ref(true)
const isSaving = ref(false)

const settings = reactive({
  restaurant: {
    name: '',
    currency: 'EUR',
    timezone: 'Europe/Paris',
    language: 'fr',
  }
})

const notifications = reactive({
  lowStockAlerts: true,
  lossAlerts: true,
  transferUpdates: true,
  defaultAlertThreshold: 10,
})

const inventory = reactive({
  enableLosses: true,
  enableTransfers: true,
  enableForecasting: true,
})

const sync = reactive({
  pollingInterval: 12,
  maxBatchSize: 50,
  maxRetries: 5,
})

onMounted(async () => {
  try {
    const { data: res } = await api.getSettings()
    if (res.status === 'success') {
      if (res.data.restaurant) {
        Object.assign(settings.restaurant, res.data.restaurant)
      }
      if (res.data.notification) {
        Object.assign(notifications, res.data.notification)
      }
      if (res.data.inventory) {
        Object.assign(inventory, res.data.inventory)
      }
      if (res.data.sync) {
        Object.assign(sync, res.data.sync)
      }
    }
  } catch (err) {
    console.error('Failed to load settings:', err)
  } finally {
    isLoading.value = false
  }
})

async function saveAll() {
  isSaving.value = true
  try {
    await api.updateSettings('restaurant', settings.restaurant)
    await api.updateSettings('notification', notifications)
    await api.updateSettings('inventory', inventory)
    await api.updateSettings('sync', sync)
    alert('Paramètres enregistrés avec succès !')
  } catch (err) {
    console.error('Failed to save settings:', err)
    alert('Erreur lors de l\'enregistrement.')
  } finally {
    isSaving.value = false
  }
}
</script>
