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
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="isOpen"
        class="modal-overlay"
        @click="handleOverlayClick"
      >
          <div
            class="glass-panel modal-content"
            :style="{ maxWidth, padding: '2rem' }"
            style="max-height: 90vh; display: flex; flex-direction: column; overflow: hidden;"
          >
            <div class="modal-header" style="flex-shrink: 0;">
            <h2
              class="modal-title"
              style="font-size: 1.15rem; margin: 0;"
            >
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
                <line
                  x1="18"
                  y1="6"
                  x2="6"
                  y2="18"
                /><line
                  x1="6"
                  y1="6"
                  x2="18"
                  y2="18"
                />
              </svg>
            </button>
          </div>
          <div style="flex-grow: 1; overflow-y: auto; max-height: 60vh;">
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
</style>
