<script setup>
import { ref, onMounted, inject } from 'vue'
import { api } from '../api'

const addToast = inject('addToast')
const preferences = ref([])
const isLoading = ref(true)
const isSaving = ref(false)

const categories = [
  { value: 'inventory', label: 'Inventaire', icon: 'package', color: '#06b6d4' },
  { value: 'synchronization', label: 'Synchronisation', icon: 'refresh-cw', color: '#8b5cf6' },
  { value: 'agent', label: 'Agents', icon: 'cpu', color: '#8b5cf6' },
  { value: 'warehouse', label: 'Pertes', icon: 'trash-2', color: '#ef4444' },
  { value: 'purchase', label: 'Achats', icon: 'shopping-cart', color: '#22c55e' },
  { value: 'transfer', label: 'Transferts', icon: 'arrow-left-right', color: '#f97316' },
  { value: 'recipe', label: 'Recettes', icon: 'book-open', color: '#a855f7' },
  { value: 'authentication', label: 'Authentification', icon: 'user', color: '#6366f1' },
  { value: 'administration', label: 'Administration', icon: 'settings', color: '#6366f1' },
  { value: 'reports', label: 'Rapports', icon: 'bar-chart', color: '#10b981' },
  { value: 'security', label: 'Sécurité', icon: 'shield', color: '#e11d48' },
  { value: 'general', label: 'Général', icon: 'bell', color: '#64748b' },
]

const prefMap = ref({})

onMounted(async () => {
  try {
    const { data: res } = await api.getNotificationPreferences()
    if (res.status === 'success') {
      preferences.value = res.data || []
      for (const p of preferences.value) {
        prefMap.value[p.category] = p
      }
    }
  } catch {
    addToast({ type: 'error', title: 'Erreur', message: 'Impossible de charger les préférences' })
  } finally {
    isLoading.value = false
  }
})

function getPref(cat) {
  return prefMap.value[cat] || { enabled: true, muted: false, critical_only: false, desktop: true, sound: false }
}

async function toggleSetting(category, key) {
  const pref = getPref(category)
  const newVal = !pref[key]
  pref[key] = newVal
  isSaving.value = true
  try {
    await api.setNotificationPreference(category, { [key]: newVal })
  } catch {
    pref[key] = !newVal
    addToast({ type: 'error', title: 'Erreur', message: 'Impossible de mettre à jour la préférence' })
  } finally {
    isSaving.value = false
  }
}

function iconSvg(icon) {
  const paths = {
    'package': '<path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/>',
    'refresh-cw': '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    'cpu': '<rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>',
    'trash-2': '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    'shopping-cart': '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
    'arrow-left-right': '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    'book-open': '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    'user': '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    'settings': '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    'bar-chart': '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
    'shield': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    'bell': '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    'check': '<polyline points="20 6 9 17 4 12"/>',
    'x': '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  }
  return paths[icon] || paths.bell
}
</script>

<template>
  <div class="preferences-page">
    <div class="page-header">
      <div>
        <h1 class="page-title">Préférences de notification</h1>
        <p class="page-subtitle">Personnalisez les notifications que vous souhaitez recevoir</p>
      </div>
    </div>

    <div v-if="isLoading" class="center-state">
      <div class="spinner" />
      <p>Chargement des préférences...</p>
    </div>

    <div v-else class="pref-list">
      <div
        v-for="cat in categories"
        :key="cat.value"
        class="pref-card"
      >
        <div class="pref-header">
          <div
            class="pref-icon"
            :style="{ background: `${cat.color}15`, color: cat.color }"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" v-html="iconSvg(cat.icon)" />
          </div>
          <div class="pref-info">
            <span class="pref-name">{{ cat.label }}</span>
            <span class="pref-desc">{{ getPref(cat.value).enabled ? 'Activé' : 'Désactivé' }}</span>
          </div>
          <label class="toggle-switch">
            <input
              type="checkbox"
              :checked="getPref(cat.value).enabled"
              @change="toggleSetting(cat.value, 'enabled')"
            />
            <span class="toggle-slider" />
          </label>
        </div>

        <div v-if="getPref(cat.value).enabled" class="pref-options">
          <label class="pref-option">
            <input
              type="checkbox"
              :checked="getPref(cat.value).critical_only"
              @change="toggleSetting(cat.value, 'critical_only')"
            />
            <span>Critiques uniquement</span>
          </label>
          <label class="pref-option">
            <input
              type="checkbox"
              :checked="getPref(cat.value).desktop"
              @change="toggleSetting(cat.value, 'desktop')"
            />
            <span>Notifications bureau</span>
          </label>
          <label class="pref-option">
            <input
              type="checkbox"
              :checked="getPref(cat.value).sound"
              @change="toggleSetting(cat.value, 'sound')"
            />
            <span>Son</span>
          </label>
          <label class="pref-option">
            <input
              type="checkbox"
              :checked="getPref(cat.value).muted"
              @change="toggleSetting(cat.value, 'muted')"
            />
            <span>Silencieux</span>
          </label>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.preferences-page {
  max-width: 720px;
  margin: 0 auto;
}
.page-header {
  margin-bottom: 1.5rem;
}
.page-title {
  font-size: 1.65rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  margin: 0;
}
.page-subtitle {
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
}
.center-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 4rem 2rem;
  text-align: center;
  color: var(--text-muted);
}
.pref-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.pref-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: border-color 0.2s;
}
.pref-card:hover {
  border-color: var(--border-hover);
}
.pref-header {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 1rem 1.25rem;
}
.pref-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.pref-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.pref-name {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--text-primary);
}
.pref-desc {
  font-size: 0.75rem;
  color: var(--text-muted);
}
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
  flex-shrink: 0;
}
.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  transition: 0.2s;
}
.toggle-slider::before {
  content: '';
  position: absolute;
  height: 16px;
  width: 16px;
  left: 3px;
  bottom: 3px;
  background: white;
  border-radius: 50%;
  transition: 0.2s;
}
.toggle-switch input:checked + .toggle-slider {
  background: var(--indigo);
}
.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(18px);
}
.pref-options {
  display: flex;
  gap: 0.25rem;
  padding: 0 1.25rem 1rem;
  flex-wrap: wrap;
}
.pref-option {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.35rem 0.7rem;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  transition: all 0.15s;
  user-select: none;
}
.pref-option:hover {
  background: rgba(255, 255, 255, 0.05);
}
.pref-option:has(input:checked) {
  background: rgba(99, 102, 241, 0.08);
  border-color: rgba(99, 102, 241, 0.2);
  color: var(--indigo-light);
}
.pref-option input {
  accent-color: var(--indigo);
}
</style>
