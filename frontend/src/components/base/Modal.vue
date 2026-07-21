<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  title: { type: String, default: '' },
  maxWidth: { type: String, default: '480px' }
})

const emit = defineEmits(['close'])

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
  if (e.target === e.currentTarget) emit('close')
}

function handleKeydown(e) {
  if (e.key === 'Escape') emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="isOpen"
        class="modal-overlay"
        @click="handleOverlayClick"
        @keydown="handleKeydown"
        tabindex="0"
      >
        <div
          class="glass-panel modal-content"
          :style="{ maxWidth }"
        >
          <div class="modal-header" style="flex-shrink: 0;">
            <h2 class="modal-title">
              {{ title }}
            </h2>
            <button
              class="btn-close"
              aria-label="Fermer"
              @click="emit('close')"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div class="modal-body-scroll">
            <slot />
          </div>
          <div
            v-if="$slots.footer"
            class="modal-footer"
            style="flex-shrink: 0;"
          >
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}
.modal-content {
  width: 100%;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  max-height: 90dvh;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}
.modal-title {
  font-size: clamp(1rem, 2.5vw, 1.25rem);
  font-weight: 700;
  margin: 0;
  color: var(--text-primary);
}
.btn-close {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  min-width: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  transition: all 0.2s;
}
.btn-close:hover {
  color: var(--coral);
  background: rgba(239, 68, 68, 0.08);
}
.modal-body-scroll {
  flex-grow: 1;
  overflow-y: auto;
  max-height: 55dvh;
}
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 0.5rem;
  flex-shrink: 0;
}

.modal-enter-active, .modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-active .modal-content, .modal-leave-active .modal-content {
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.modal-enter-from, .modal-leave-to {
  opacity: 0;
}
.modal-enter-from .modal-content {
  transform: translateY(20px);
}
.modal-leave-to .modal-content {
  transform: translateY(20px);
}

@media (max-width: 600px) {
  .modal-overlay {
    padding: 0;
    align-items: flex-end;
  }
  .modal-content {
    max-width: 100% !important;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    max-height: 85dvh;
    padding: 1.25rem;
  }
  .modal-body-scroll {
    max-height: 50dvh;
  }
}
</style>
