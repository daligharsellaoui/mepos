# Skill: Vue 3 Component Development

## Purpose
Create new Vue 3 components that follow mePOS STOCK project conventions.

## Conventions

### File Structure
```
frontend/src/
├── components/
│   ├── base/          # Reusable design system components (Badge, Card, Modal, etc.)
│   ├── layout/        # Navigation and shell components
│   └── forecast/      # Feature-specific components
├── views/             # Page-level components (lazy-loaded by router)
└── composables/       # Reusable logic (useOffline, usePolling)
```

### Component Template
```vue
<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useAppStore } from '../stores/app'
import { api } from '../api'

// Props with defaults
const props = defineProps({
  title: { type: String, default: '' },
  disabled: { type: Boolean, default: false }
})

// Emits
const emit = defineEmits(['update', 'close'])

// Store access
const auth = useAuthStore()
const app = useAppStore()

// Reactive state
const isLoading = ref(false)
const items = ref([])

// Computed
const filteredItems = computed(() =>
  items.value.filter(i => !i.deleted)
)

// Methods
async function loadData() {
  isLoading.value = true
  try {
    const res = await api.getItems()
    if (res.data.status === 'success') {
      items.value = res.data.data
    }
  } catch (err) {
    console.error('Failed to load items:', err)
  } finally {
    isLoading.value = false
  }
}

// Lifecycle
onMounted(() => loadData())
</script>

<template>
  <div class="my-component">
    <h2>{{ title }}</h2>
    <slot />
  </div>
</template>

<style scoped>
.my-component {
  padding: 1.5rem;
}
</style>
```

### Critical Rules

1. **Always use named API import:**
   ```javascript
   import { api } from '../api'  // ✅ Correct
   import api from '../api'       // ❌ Wrong (axios client, not methods)
   ```

2. **Props must have defaults** (or be `required: true`):
   ```javascript
   defineProps({
     title: { type: String, default: '' },    // ✅
     title: String,                            // ❌ Missing default
   })
   ```

3. **Use `<script setup>`** (never Options API)

4. **Access props in template directly** (auto-exposed):
   ```vue
   <template>
     <div>{{ title }}</div>  <!-- ✅ Auto-exposed -->
     <div>{{ props.title }}</div>  <!-- ❌ Unnecessary -->
   </template>
   ```

5. **Remove unused imports** (ESLint will warn)

### Adding a New View

1. Create `frontend/src/views/MyView.vue`
2. Add route in `frontend/src/router/index.js`:
   ```javascript
   {
     path: 'my-view',
     name: 'MyView',
     component: () => import('../views/MyView.vue')
   }
   ```
3. Add nav item in `Sidebar.vue` and `MobileNav.vue`

### Adding a New Base Component

1. Create `frontend/src/components/base/MyComponent.vue`
2. Use BEM naming: `.my-component`, `.my-component__header`
3. Export as default (auto-registered in `<script setup>`)
4. Add to `architecture.md` project tree
