<script setup>
defineProps({
  icon: { type: [String, Object], default: null },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  actionLabel: { type: String, default: '' },
  compact: { type: Boolean, default: false }
})

const emit = defineEmits(['action'])
</script>

<template>
  <div
    class="empty-state"
    style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 1rem; border-radius: var(--radius-lg); border: 1px dashed var(--border-color); background: rgba(255,255,255,0.01);"
    :style="{ padding: compact ? '2rem 1rem' : '4rem 2rem' }"
  >
    <div style="color: var(--text-muted);">
      <slot name="icon">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          style="opacity: 0.4;"
        >
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        </svg>
      </slot>
    </div>
    <h3 :style="{ fontSize: compact ? '1rem' : '1.15rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }">
      {{ title }}
    </h3>
    <p
      v-if="description"
      style="font-size: 0.875rem; color: var(--text-secondary); max-width: 360px; line-height: 1.5; margin: 0;"
    >
      {{ description }}
    </p>
    <button
      v-if="actionLabel"
      class="touch-btn"
      style="margin-top: 0.5rem;"
      @click="emit('action')"
    >
      {{ actionLabel }}
    </button>
  </div>
</template>
