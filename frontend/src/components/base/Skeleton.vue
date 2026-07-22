<script setup>
const props = defineProps({
  width: { type: [String, Number], default: '100%' },
  height: { type: [String, Number], default: '1rem' },
  borderRadius: { type: String, default: '' },
  variant: { type: String, default: 'text' }
})

const computedStyle = () => ({
  width: props.width,
  height: props.height,
  borderRadius: props.borderRadius || (props.variant === 'circle' ? '50%' : props.variant === 'text' ? '4px' : '8px')
})
</script>

<template>
  <div
    class="skeleton"
    :style="computedStyle()"
    aria-hidden="true"
  />
</template>
