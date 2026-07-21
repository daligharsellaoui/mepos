<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  actions: { type: Array, required: true },
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits(['action'])

const isOpen = ref(false)
const menuRef = ref(null)
const triggerRef = ref(null)

const visibleActions = computed(() => props.actions.filter(a => !a.hidden))

function toggle() {
  if (!props.disabled && visibleActions.value.length > 0) {
    isOpen.value = !isOpen.value
  }
}

function handleAction(action) {
  if (!action.disabled) {
    emit('action', action.key)
    isOpen.value = false
  }
}

function handleClickOutside(e) {
  if (isOpen.value && menuRef.value && !menuRef.value.contains(e.target) && !triggerRef.value.contains(e.target)) {
    isOpen.value = false
  }
}

function handleKeydown(e) {
  if (e.key === 'Escape') isOpen.value = false
  if (e.key === 'Enter' && e.target === triggerRef.value) toggle()
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))
</script>

<template>
  <div style="position: relative; display: inline-flex;">
    <button
      ref="triggerRef"
      class="row-action-trigger"
      :class="{ 'is-active': isOpen }"
      :disabled="disabled || visibleActions.length === 0"
      aria-haspopup="true"
      :aria-expanded="isOpen"
      aria-label="Plus d'actions"
      @click.stop="toggle"
      @keydown="handleKeydown"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
    </button>
    <Transition name="menu-fade">
      <div
        v-if="isOpen"
        ref="menuRef"
        class="row-action-dropdown"
        role="menu"
        @click.stop
      >
        <button
          v-for="action in visibleActions"
          :key="action.key"
          class="row-action-item"
          :class="{ 'is-danger': action.danger, 'is-disabled': action.disabled }"
          :disabled="action.disabled"
          role="menuitem"
          :aria-label="action.label"
          @click.stop="handleAction(action)"
        >
          <span class="action-icon" v-html="action.icon" />
          <span class="action-text">{{ action.label }}</span>
          <span v-if="action.disabled && action.disabledReason" class="action-disabled-reason">{{ action.disabledReason }}</span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.row-action-trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.3rem 0.6rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
  font-family: var(--font-sans);
  transition: all 0.15s ease;
  min-height: 32px;
}
.row-action-trigger:hover {
  background: rgba(255,255,255,0.04);
  border-color: var(--border-color);
  color: var(--text-primary);
}
.row-action-trigger:focus-visible {
  outline: 2px solid var(--indigo);
  outline-offset: 2px;
}
.row-action-trigger.is-active {
  background: rgba(99,102,241,0.1);
  border-color: rgba(99,102,241,0.3);
  color: var(--indigo-light);
}
.row-action-trigger:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.row-action-label {
  font-size: 0.75rem;
}
.row-action-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 220px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: 0 12px 40px rgba(0,0,0,0.5);
  padding: 0.35rem;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.row-action-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 0.75rem;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  width: 100%;
  font-family: var(--font-sans);
  transition: background 0.12s ease;
}
.row-action-item:hover:not(.is-disabled) {
  background: rgba(255,255,255,0.04);
}
.row-action-item.is-danger {
  color: var(--coral);
}
.row-action-item.is-danger:hover:not(.is-disabled) {
  background: rgba(239,68,68,0.08);
}
.row-action-item.is-disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.row-action-item:focus-visible {
  outline: 2px solid var(--indigo);
  outline-offset: -2px;
}
.action-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  font-size: 1rem;
  line-height: 1;
}
.action-text {
  flex: 1;
}
.action-disabled-reason {
  font-size: 0.7rem;
  color: var(--text-muted);
  max-width: 80px;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.menu-fade-enter-active,
.menu-fade-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.menu-fade-enter-from,
.menu-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>