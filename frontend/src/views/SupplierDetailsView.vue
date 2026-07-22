<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSupplierStore } from '../stores/suppliers'
import { useAuthStore } from '../stores/auth'
import PageContainer from '../components/base/PageContainer.vue'
import Card from '../components/base/Card.vue'
import Badge from '../components/base/Badge.vue'
import Skeleton from '../components/base/Skeleton.vue'
import ConfirmDialog from '../components/base/ConfirmDialog.vue'
import SupplierForm from '../components/suppliers/SupplierForm.vue'

const route = useRoute()
const router = useRouter()
const store = useSupplierStore()
const auth = useAuthStore()

const ingredients = ref([])
const stats = ref({})
const score = ref(null)
const showForm = ref(false)
const showDeleteDialog = ref(false)
const deleteLoading = ref(false)

const addToast = (msg, type) => {
  const event = new CustomEvent('toast', { detail: { message: msg, type: type || 'success' } })
  window.dispatchEvent(event)
}

async function loadData() {
  const id = parseInt(route.params.id, 10)
  if (isNaN(id)) return
  await Promise.all([
    store.fetchSupplier(id),
    store.fetchSupplierIngredients(id).then(data => { ingredients.value = data }).catch(() => {}),
    store.fetchSupplierScore(id).then(data => { score.value = data }).catch(() => {}),
  ])
  if (store.currentSupplier) {
    stats.value = {
      ingredients_count: store.currentSupplier.ingredients_count || 0,
      active_ingredients: ingredients.value.filter(i => i.status !== 'archived').length,
      preferred: store.currentSupplier.preferred,
      rating: store.currentSupplier.rating,
    }
  }
}

onMounted(loadData)

watch(() => route.params.id, () => {
  loadData()
})

function editSupplier() {
  showForm.value = true
}

const scoreClass = computed(() => {
  if (!score.value) return ''
  const s = score.value.score
  if (s >= 75) return 'score-excellent'
  if (s >= 50) return 'score-good'
  if (s >= 25) return 'score-average'
  return 'score-poor'
})

function closeForm() {
  showForm.value = false
}

function onSaved() {
  closeForm()
  loadData()
  addToast('Fournisseur mis à jour.')
}

async function archiveSupplier() {
  if (!store.currentSupplier) return
  try {
    if (store.currentSupplier.status === 'archived') {
      await store.restoreSupplier(store.currentSupplier.id)
    } else {
      await store.archiveSupplier(store.currentSupplier.id)
    }
    await loadData()
    addToast(store.currentSupplier.status === 'archived' ? 'Fournisseur restauré.' : 'Fournisseur archivé.')
  } catch { addToast('Erreur.', 'error') }
}

function confirmDelete() {
  showDeleteDialog.value = true
}

async function handleDelete() {
  if (!store.currentSupplier) return
  deleteLoading.value = true
  try {
    await store.deleteSupplier(store.currentSupplier.id)
    addToast('Fournisseur supprimé.')
    router.push('/app/suppliers')
  } catch (err) {
    addToast(err.message || 'Erreur.', 'error')
  } finally {
    deleteLoading.value = false
    showDeleteDialog.value = false
  }
}
</script>

<template>
  <div v-if="store.loading" style="display: flex; flex-direction: column; gap: 0.75rem; padding: 1.25rem;">
    <div v-for="n in 8" :key="n" class="skeleton" style="height: 52px; width: 100%; border-radius: var(--radius-sm);" />
  </div>

  <template v-else-if="store.currentSupplier">
    <PageContainer>
      <template #title>
        <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
          <button class="touch-btn touch-btn-secondary" style="padding: 0.3rem 0.6rem; min-height: auto;" @click="router.push('/app/suppliers')">◀ Retour</button>
          <span>{{ store.currentSupplier.name }}</span>
          <span v-if="store.currentSupplier.preferred" class="badge badge-success">Préféré</span>
          <span :class="['badge', store.currentSupplier.status === 'active' ? 'badge-success' : 'badge-warn']">{{ store.currentSupplier.status === 'active' ? 'Actif' : 'Archivé' }}</span>
        </div>
      </template>
      <template #actions>
        <button class="touch-btn" @click="editSupplier" v-if="!auth.isCook">Modifier</button>
        <button class="touch-btn touch-btn-secondary" @click="archiveSupplier" v-if="!auth.isCook">
          {{ store.currentSupplier.status === 'archived' ? 'Restaurer' : 'Archiver' }}
        </button>
        <button v-if="auth.isAdmin" class="touch-btn touch-btn-danger" @click="confirmDelete">Supprimer</button>
      </template>
    </PageContainer>

    <div class="details-grid">
      <Card title="Informations société">
        <p><strong>Nom:</strong> {{ store.currentSupplier.name }}</p>
        <p><strong>Société:</strong> {{ store.currentSupplier.company_name || '—' }}</p>
        <p><strong>Référence:</strong> {{ store.currentSupplier.reference || '—' }}</p>
        <p><strong>Matricule fiscal:</strong> {{ store.currentSupplier.tax_number || '—' }}</p>
        <p><strong>Registre de commerce:</strong> {{ store.currentSupplier.registration_number || '—' }}</p>
        <p><strong>Site web:</strong> <a v-if="store.currentSupplier.website" :href="store.currentSupplier.website" target="_blank">{{ store.currentSupplier.website }}</a><span v-else>—</span></p>
      </Card>

      <Card title="Contact">
        <p><strong>Personne contact:</strong> {{ store.currentSupplier.contact_person || '—' }}</p>
        <p><strong>Email:</strong> {{ store.currentSupplier.email || '—' }}</p>
        <p><strong>Téléphone:</strong> {{ store.currentSupplier.phone || '—' }}</p>
        <p><strong>Mobile:</strong> {{ store.currentSupplier.mobile || '—' }}</p>
      </Card>

      <Card title="Adresse">
        <p>{{ store.currentSupplier.address || '' }}{{ store.currentSupplier.address && store.currentSupplier.city ? ', ' : '' }}{{ store.currentSupplier.city || '' }}{{ store.currentSupplier.postal_code ? ' ' + store.currentSupplier.postal_code : '' }}{{ store.currentSupplier.country ? ' — ' + store.currentSupplier.country : '' }}</p>
      </Card>

      <Card title="Paiement">
        <p><strong>Conditions:</strong> {{ store.currentSupplier.payment_terms || '—' }}</p>
        <p><strong>Méthode:</strong> {{ store.currentSupplier.payment_method || '—' }}</p>
        <p><strong>Devise:</strong> {{ store.currentSupplier.currency || 'TND' }}</p>
        <p><strong>Délai livraison:</strong> {{ store.currentSupplier.delivery_delay != null ? store.currentSupplier.delivery_delay + ' jours' : '—' }}</p>
        <p><strong>Montant min. commande:</strong> {{ store.currentSupplier.minimum_order_amount != null ? parseFloat(store.currentSupplier.minimum_order_amount).toFixed(3) + ' ' + (store.currentSupplier.currency || 'TND') : '—' }}</p>
      </Card>

      <Card title="Statistiques">
        <div class="metric-card">
          <span class="metric-title">Ingrédients fournis</span>
          <span class="metric-value">{{ stats.ingredients_count }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-title">Ingrédients actifs</span>
          <span class="metric-value">{{ stats.active_ingredients }}</span>
        </div>
        <div class="metric-card">
          <span class="metric-title">Évaluation</span>
          <span class="metric-value">{{ store.currentSupplier.rating || '—' }}/5</span>
        </div>
      </Card>

      <Card title="Score fournisseur" v-if="score">
        <div class="score-container">
          <div class="score-circle" :class="scoreClass" :style="{ '--pct': score.score + '%' }">
            <span class="score-value">{{ score.score }}</span>
            <span class="score-label">{{ score.label }}</span>
          </div>
          <div class="score-bars">
            <div class="score-bar-row">
              <span class="score-bar-label">Pertes / Achats</span>
              <div class="score-bar-track">
                <div class="score-bar-fill" :style="{ width: score.components.waste_ratio + '%' }"></div>
              </div>
              <span class="score-bar-value">{{ score.components.waste_ratio }}%</span>
            </div>
            <div class="score-bar-row">
              <span class="score-bar-label">Fréquence pertes</span>
              <div class="score-bar-track">
                <div class="score-bar-fill" :style="{ width: score.components.frequency + '%' }"></div>
              </div>
              <span class="score-bar-value">{{ score.components.frequency }}%</span>
            </div>
            <div class="score-bar-row">
              <span class="score-bar-label">Impact coût</span>
              <div class="score-bar-track">
                <div class="score-bar-fill" :style="{ width: score.components.cost_impact + '%' }"></div>
              </div>
              <span class="score-bar-value">{{ score.components.cost_impact }}%</span>
            </div>
          </div>
        </div>
        <div class="score-meta">
          <span>{{ score.details.ingredient_count }} ingrédient(s) · {{ score.details.loss_incidents }} perte(s) · {{ score.details.total_loss_qty }} {{ ingredients[0]?.unit || 'u' }} perdus</span>
        </div>
      </Card>

      <Card title="Ingrédients fournis" v-if="!score || true">
        <table class="mepos-table" v-if="ingredients.length">
          <thead>
            <tr><th>Ingrédient</th><th>Unité</th><th>Statut</th></tr>
          </thead>
          <tbody>
            <tr v-for="ing in ingredients" :key="ing.id">
              <td><strong style="color: var(--text-primary);">{{ ing.name }}</strong></td>
              <td>{{ ing.unit }}</td>
              <td>
                <span :class="['badge', ing.status === 'active' ? 'badge-success' : 'badge-warn']">{{ ing.status || 'active' }}</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="text-muted" style="color: var(--text-muted); font-size: 0.9rem;">Aucun ingrédient lié.</p>
      </Card>

      <Card title="Notes" v-if="store.currentSupplier.notes">
        <p>{{ store.currentSupplier.notes }}</p>
      </Card>

      <Card title="Historique des achats" class="placeholder-card">
        <p style="color: var(--text-muted);">Fonctionnalité à venir — Les achats seront associés aux fournisseurs dans une version future.</p>
      </Card>

      <Card title="Livraisons récentes" class="placeholder-card">
        <p style="color: var(--text-muted);">Fonctionnalité à venir — Suivi des livraisons à implémenter.</p>
      </Card>
    </div>

    <SupplierForm :is-open="showForm" :supplier="store.currentSupplier" @close="closeForm" @saved="onSaved" />

    <ConfirmDialog
      :is-open="showDeleteDialog"
      title="Supprimer le fournisseur"
      :message="`Êtes-vous sûr de vouloir supprimer '${store.currentSupplier.name}' ?`"
      confirm-label="Supprimer"
      variant="danger"
      :loading="deleteLoading"
      @confirm="handleDelete"
      @cancel="showDeleteDialog = false"
      @close="showDeleteDialog = false"
    />
  </template>

  <div v-else style="padding: 2rem; text-align: center; color: var(--text-muted);">
    Fournisseur introuvable.
  </div>
</template>
