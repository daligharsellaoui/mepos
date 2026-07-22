<script setup>
import { ref, watch } from 'vue'
import Modal from '../base/Modal.vue'
import { useSupplierStore } from '../../stores/suppliers'

const props = defineProps({
  isOpen: Boolean,
  supplier: { type: Object, default: null },
})
const emit = defineEmits(['close', 'saved'])

const store = useSupplierStore()

const form = ref({
  name: '',
  company_name: '',
  reference: '',
  tax_number: '',
  registration_number: '',
  contact_person: '',
  email: '',
  phone: '',
  mobile: '',
  website: '',
  address: '',
  city: '',
  postal_code: '',
  country: 'Tunisie',
  payment_terms: '',
  payment_method: '',
  currency: 'TND',
  delivery_delay: 0,
  minimum_order_amount: 0,
  notes: '',
  preferred: false,
  rating: 0,
})

const saving = ref(false)
const formError = ref(null)

watch(() => props.isOpen, (val) => {
  if (val) {
    if (props.supplier) {
      form.value = { ...props.supplier }
    } else {
      form.value = {
        name: '', company_name: '', reference: '', tax_number: '', registration_number: '',
        contact_person: '', email: '', phone: '', mobile: '', website: '', address: '',
        city: '', postal_code: '', country: 'Tunisie', payment_terms: '', payment_method: '',
        currency: 'TND', delivery_delay: 0, minimum_order_amount: 0, notes: '',
        preferred: false, rating: 0,
      }
    }
    formError.value = null
  }
})

async function submit() {
  formError.value = null
  if (!form.value.name.trim()) {
    formError.value = 'Le nom du fournisseur est requis.'
    return
  }
  if (form.value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.email)) {
    formError.value = "L'email n'est pas valide."
    return
  }
  saving.value = true
  try {
    if (props.supplier) {
      await store.updateSupplier(props.supplier.id, form.value)
    } else {
      await store.createSupplier(form.value)
    }
    emit('saved')
  } catch (err) {
    formError.value = err.message || "Erreur lors de l'enregistrement."
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Modal
    :is-open="isOpen"
    :title="supplier ? 'Modifier le fournisseur' : 'Nouveau fournisseur'"
    max-width="640px"
    @close="$emit('close')"
  >
    <div class="form-grid">
      <h3 class="form-section-title">Informations société</h3>
      <div class="form-group">
        <label class="form-label">Nom *</label>
        <input class="form-input" v-model="form.name" placeholder="Nom du fournisseur" />
      </div>
      <div class="form-group">
        <label class="form-label">Société</label>
        <input class="form-input" v-model="form.company_name" placeholder="Raison sociale" />
      </div>
      <div class="form-group">
        <label class="form-label">Référence</label>
        <input class="form-input" v-model="form.reference" placeholder="Réf. interne" />
      </div>
      <div class="form-group">
        <label class="form-label">Matricule fiscal</label>
        <input class="form-input" v-model="form.tax_number" placeholder="Matricule fiscal" />
      </div>
      <div class="form-group">
        <label class="form-label">Registre de commerce</label>
        <input class="form-input" v-model="form.registration_number" placeholder="Registre de commerce" />
      </div>
      <div class="form-group">
        <label class="form-label">Site web</label>
        <input class="form-input" v-model="form.website" placeholder="https://" />
      </div>

      <h3 class="form-section-title">Contact</h3>
      <div class="form-group">
        <label class="form-label">Personne contact</label>
        <input class="form-input" v-model="form.contact_person" placeholder="Nom du contact" />
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-input" type="email" v-model="form.email" placeholder="contact@example.com" />
      </div>
      <div class="form-group">
        <label class="form-label">Téléphone</label>
        <input class="form-input" v-model="form.phone" placeholder="+216 XX XXX XXX" />
      </div>
      <div class="form-group">
        <label class="form-label">Mobile</label>
        <input class="form-input" v-model="form.mobile" placeholder="+216 XX XXX XXX" />
      </div>

      <h3 class="form-section-title">Adresse</h3>
      <div class="form-group">
        <label class="form-label">Adresse</label>
        <textarea class="form-input" v-model="form.address" placeholder="Adresse complète"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Ville</label>
        <input class="form-input" v-model="form.city" placeholder="Ville" />
      </div>
      <div class="form-group">
        <label class="form-label">Code postal</label>
        <input class="form-input" v-model="form.postal_code" placeholder="Code postal" />
      </div>
      <div class="form-group">
        <label class="form-label">Pays</label>
        <input class="form-input" v-model="form.country" placeholder="Pays" />
      </div>

      <h3 class="form-section-title">Paiement</h3>
      <div class="form-group">
        <label class="form-label">Conditions de paiement</label>
        <input class="form-input" v-model="form.payment_terms" placeholder="30 jours" />
      </div>
      <div class="form-group">
        <label class="form-label">Méthode de paiement</label>
        <input class="form-input" v-model="form.payment_method" placeholder="Virement, chèque..." />
      </div>
      <div class="form-group">
        <label class="form-label">Devise</label>
        <select class="form-select" v-model="form.currency">
          <option value="TND">TND</option>
          <option value="EUR">EUR</option>
          <option value="USD">USD</option>
        </select>
      </div>

      <h3 class="form-section-title">Logistique</h3>
      <div class="form-group">
        <label class="form-label">Délai de livraison (jours)</label>
        <input class="form-input" type="number" v-model.number="form.delivery_delay" min="0" />
      </div>
      <div class="form-group">
        <label class="form-label">Montant minimum de commande</label>
        <input class="form-input" type="number" step="0.001" v-model.number="form.minimum_order_amount" min="0" />
      </div>

      <h3 class="form-section-title">Notes</h3>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <textarea class="form-input" rows="3" v-model="form.notes" placeholder="Notes internes..."></textarea>
      </div>
      <div class="form-group" style="flex-direction: row; align-items: center; gap: 0.75rem;">
        <input type="checkbox" v-model="form.preferred" id="preferred" />
        <label for="preferred" style="font-weight: 600;">Fournisseur préféré</label>
      </div>
      <div class="form-group">
        <label class="form-label">Évaluation (1-5)</label>
        <select class="form-select" v-model.number="form.rating">
          <option :value="0">—</option>
          <option v-for="n in 5" :key="n" :value="n">{{ n }}</option>
        </select>
      </div>
    </div>

    <div v-if="formError" class="alert-banner alert-banner-danger">{{ formError }}</div>

    <template #footer>
      <button class="touch-btn touch-btn-secondary" @click="$emit('close')">Annuler</button>
      <button class="touch-btn" :disabled="saving" @click="submit">
        <span v-if="saving" class="spinner" style="display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%;" />
        <span v-else>{{ supplier ? 'Enregistrer' : 'Créer' }}</span>
      </button>
    </template>
  </Modal>
</template>
