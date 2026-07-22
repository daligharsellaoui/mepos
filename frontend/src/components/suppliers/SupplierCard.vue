<script setup>
defineProps({
  supplier: { type: Object, required: true },
  compact: { type: Boolean, default: false },
})
</script>

<template>
  <div class="glass-panel supplier-card" :class="{ compact }">
    <div class="supplier-card-header">
      <div>
        <span class="supplier-name">{{ supplier.name }}</span>
        <span v-if="supplier.company_name" class="supplier-company">{{ supplier.company_name }}</span>
      </div>
      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
        <span v-if="supplier.preferred" class="badge badge-success" size="sm">Préféré</span>
        <span
          :class="['badge', supplier.status === 'active' ? 'badge-success' : 'badge-warn']"
          size="sm"
        >{{ supplier.status === 'active' ? 'Actif' : 'Archivé' }}</span>
      </div>
    </div>
    <div class="supplier-card-body" v-if="!compact">
      <p v-if="supplier.contact_person"><strong>Contact:</strong> {{ supplier.contact_person }}</p>
      <p v-if="supplier.email"><strong>Email:</strong> {{ supplier.email }}</p>
      <p v-if="supplier.phone"><strong>Tél:</strong> {{ supplier.phone }}</p>
      <p v-if="supplier.city"><strong>Ville:</strong> {{ supplier.city }}</p>
    </div>
  </div>
</template>
