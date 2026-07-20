<template>
  <div class="tenant-settings">
    <div class="page-header">
      <h1>Paramètres du Restaurant</h1>
      <button class="btn btn-primary" @click="saveAll" :disabled="isSaving">
        {{ isSaving ? 'Enregistrement...' : 'Enregistrer' }}
      </button>
    </div>

    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>Chargement des paramètres...</p>
    </div>

    <div v-else class="settings-grid">
      <!-- Restaurant Info -->
      <div class="settings-card">
        <h2>🏪 Informations du Restaurant</h2>
        <div class="form-group">
          <label>Nom du restaurant</label>
          <input v-model="settings.restaurant.name" type="text" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Devise</label>
            <select v-model="settings.restaurant.currency">
              <option value="EUR">EUR (€)</option>
              <option value="TND">TND (د.ت)</option>
              <option value="USD">USD ($)</option>
              <option value="GBP">GBP (£)</option>
              <option value="MAD">MAD (د.م.)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Fuseau horaire</label>
            <select v-model="settings.restaurant.timezone">
              <option value="Europe/Paris">Europe/Paris</option>
              <option value="Africa/Tunis">Africa/Tunis</option>
              <option value="Africa/Casablanca">Africa/Casablanca</option>
              <option value="UTC">UTC</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label>Langue</label>
          <select v-model="settings.restaurant.language">
            <option value="fr">Français</option>
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </div>
      </div>

      <!-- Notification Settings -->
      <div class="settings-card">
        <h2>🔔 Notifications</h2>
        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" v-model="notifications.lowStockAlerts" />
            Alertes de stock bas
          </label>
        </div>
        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" v-model="notifications.lossAlerts" />
            Alertes de pertes
          </label>
        </div>
        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" v-model="notifications.transferUpdates" />
            Mises à jour des transferts
          </label>
        </div>
        <div class="form-group">
          <label>Seuil d'alerte stock (défaut)</label>
          <input v-model.number="notifications.defaultAlertThreshold" type="number" min="0" />
        </div>
      </div>

      <!-- Inventory Settings -->
      <div class="settings-card">
        <h2>📦 Inventaire</h2>
        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" v-model="inventory.enableLosses" />
            Activer le suivi des pertes
          </label>
        </div>
        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" v-model="inventory.enableTransfers" />
            Activer les transferts de stock
          </label>
        </div>
        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" v-model="inventory.enableForecasting" />
            Activer les prévisions
          </label>
        </div>
      </div>

      <!-- Sync Settings -->
      <div class="settings-card">
        <h2>🔄 Synchronisation</h2>
        <div class="form-group">
          <label>Intervalle de synchronisation (secondes)</label>
          <input v-model.number="sync.pollingInterval" type="number" min="5" max="300" />
        </div>
        <div class="form-group">
          <label>Taille maximale des lots</label>
          <input v-model.number="sync.maxBatchSize" type="number" min="1" max="500" />
        </div>
        <div class="form-group">
          <label>Tentatives maximales</label>
          <input v-model.number="sync.maxRetries" type="number" min="1" max="20" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue'
import { api } from '../api'

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

<style scoped>
.tenant-settings { padding: 24px; }
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}
.page-header h1 { font-size: 24px; font-weight: 700; color: #1a1a2e; }

.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 20px;
}

.settings-card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}
.settings-card h2 { font-size: 16px; margin: 0 0 16px 0; color: #1a1a2e; }

.form-group { margin-bottom: 14px; }
.form-group label { display: block; margin-bottom: 4px; font-size: 13px; font-weight: 500; color: #374151; }
.form-group input, .form-group select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
}
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

.checkbox-label {
  display: flex !important;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.checkbox-label input { width: auto; }

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}
.btn-primary { background: #6366f1; color: white; }
.btn-primary:hover { background: #4f46e5; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.loading-state { text-align: center; padding: 48px; color: #64748b; }
.spinner {
  width: 32px; height: 32px;
  border: 3px solid #e2e8f0; border-top-color: #6366f1;
  border-radius: 50%; animation: spin 0.8s linear infinite;
  margin: 0 auto 12px;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
