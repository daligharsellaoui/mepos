<script setup>
defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  padding: { type: String, default: '1.5rem' },
  hoverable: { type: Boolean, default: false },
  actions: { type: Boolean, default: false },
  style: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['click'])
</script>

<template>
  <div
    class="metric-card"
    :class="{ 'card-hoverable': hoverable }"
    :style="{
      padding: padding || '1.5rem',
      cursor: hoverable ? 'pointer' : undefined,
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--bg-card)',
      transition: 'all 0.2s ease',
      ...style
    }"
    @click="hoverable && emit('click')"
  >
    <div
      v-if="title || subtitle || $slots.actions"
      style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; gap: 1rem;"
    >
      <div style="display: flex; flex-direction: column; gap: 0.15rem;">
        <h3
          v-if="title"
          style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin: 0;"
        >
          {{ title }}
        </h3>
        <p
          v-if="subtitle"
          style="font-size: 0.8rem; color: var(--text-secondary); margin: 0;"
        >
          {{ subtitle }}
        </p>
      </div>
      <div
        v-if="$slots.actions"
        style="display: flex; gap: 0.5rem; flex-shrink: 0;"
      >
        <slot name="actions" />
      </div>
    </div>
    <slot />
  </div>
</template>
