<script setup>
defineProps({
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
})
</script>

<template>
  <div>
    <div class="view-title-section">
      <div>
        <h1 class="view-title">
          {{ title }}
        </h1>
        <p
          v-if="subtitle"
          style="color: var(--text-secondary); margin-top: 0.25rem;"
        >
          {{ subtitle }}
        </p>
      </div>
      <div style="display: flex; gap: 0.75rem; flex-shrink: 0;">
        <slot name="actions" />
      </div>
    </div>
    <slot />
  </div>
</template>
