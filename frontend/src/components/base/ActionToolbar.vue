<script setup>
defineProps({
  searchable: { type: Boolean, default: false },
  searchPlaceholder: { type: String, default: 'Rechercher...' },
  searchValue: { type: String, default: '' },
  filterOptions: { type: Array, default: () => [] },
  filterValue: { type: String, default: '' },
  filterLabel: { type: String, default: 'Filtrer' },
})

const emit = defineEmits(['update:searchValue', 'update:filterValue'])
</script>

<template>
  <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; align-items: center;">
    <div
      v-if="searchable"
      style="flex: 1; min-width: 200px;"
    >
      <input
        :value="searchValue"
        class="form-input"
        :placeholder="searchPlaceholder"
        style="width: 100%;"
        @input="emit('update:searchValue', $event.target.value)"
      >
    </div>
    <div
      v-if="filterOptions.length > 0"
      style="width: auto;"
    >
      <select
        :value="filterValue"
        class="form-select"
        style="width: auto; min-width: 140px;"
        @change="emit('update:filterValue', $event.target.value)"
      >
        <option value="">
          {{ filterLabel }}
        </option>
        <option
          v-for="opt in filterOptions"
          :key="opt.value"
          :value="opt.value"
        >
          {{ opt.label }}
        </option>
      </select>
    </div>
    <div style="display: flex; gap: 0.5rem; flex-shrink: 0;">
      <slot name="actions" />
    </div>
  </div>
</template>
