<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  title: { type: String, default: 'Confirmer' },
  message: { type: String, default: 'Êtes-vous sûr de vouloir continuer ?' },
  confirmLabel: { type: String, default: 'Confirmer' },
  cancelLabel: { type: String, default: 'Annuler' },
  variant: { type: String, default: 'danger' },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  maxWidth: { type: String, default: '420px' },
  warnings: { type: Array, default: () => [] },
})

const emit = defineEmits(['confirm', 'cancel', 'close'])

const isVisible = ref(props.isOpen)

watch(() => props.isOpen, (val) => {
  isVisible.value = val
  if (val) {
    document.body.style.overflow = 'hidden'
  } else {
    document.body.style.overflow = ''
  }
})

function handleOverlayClick(e) {
  if (e.target === e.currentTarget && !props.loading) emit('close')
}

function handleKeydown(e) {
  if (e.key === 'Escape' && !props.loading) emit('close')
  if (e.key === 'Enter' && !props.loading && !props.disabled) emit('confirm')
}

const btnColor = {
  danger: 'var(--coral)',
  warning: 'var(--amber)',
  primary: 'var(--indigo)',
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="isOpen"
        class="modal-overlay"
        tabindex="0"
        @click="handleOverlayClick"
        @keydown="handleKeydown"
      >
        <div
          class="glass-panel modal-content"
          :style="{ maxWidth, padding: '2rem' }"
        >
          <div class="modal-header">
            <h2
              class="modal-title"
              style="font-size: 1.15rem; margin: 0;"
            >
              {{ title }}
            </h2>
            <button
              class="btn-close"
              aria-label="Fermer"
              :disabled="loading"
              @click="emit('close')"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>

          <div style="flex-grow: 1;">
            <p style="color: var(--text-secondary); line-height: 1.6; margin: 0;">
              {{ message }}
            </p>
            <div
              v-if="warnings.length > 0"
              style="margin-top: 1rem; display: flex; flex-direction: column; gap: 0.5rem;"
            >
              <div
                v-for="(w, i) in warnings"
                :key="i"
                style="padding: 0.75rem 1rem; background: rgba(239,68,68,0.05); border: 1px solid rgba(239,68,68,0.15); border-radius: var(--radius-md); color: var(--coral); font-size: 0.85rem;"
              >
                {{ w }}
              </div>
            </div>
          </div>

          <div
            class="modal-footer"
            style="display: flex; gap: 0.75rem; margin-top: 1.5rem;"
          >
            <button
              class="touch-btn touch-btn-secondary"
              style="flex: 1;"
              :disabled="loading"
              @click="emit('cancel')"
            >
              {{ cancelLabel }}
            </button>
            <button
              class="touch-btn"
              :style="{ background: btnColor[variant], flex: 1 }"
              :disabled="loading || disabled"
              @click="emit('confirm')"
            >
              <span
                v-if="loading"
                class="spinner"
                style="display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%;"
              />
              <span v-else>{{ confirmLabel }}</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
