import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { useOffline } from '../useOffline'

// Wrap composable in a component to trigger lifecycle hooks
function useOfflineWrapper() {
  return defineComponent({
    setup() {
      return useOffline()
    },
    template: '<div>{{ isOffline }}</div>'
  })
}

describe('useOffline composable', () => {
  let originalOnLine

  beforeEach(() => {
    originalOnLine = navigator.onLine
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: originalOnLine, configurable: true })
  })

  it('returns isOffline ref based on navigator.onLine', () => {
    const Component = useOfflineWrapper()
    const wrapper = mount(Component)
    expect(wrapper.vm.isOffline).toBe(false)
    wrapper.unmount()
  })

  it('sets isOffline to true when offline event fires', async () => {
    const Component = useOfflineWrapper()
    const wrapper = mount(Component)

    window.dispatchEvent(new Event('offline'))
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.isOffline).toBe(true)
    wrapper.unmount()
  })

  it('sets isOffline to false when online event fires', async () => {
    const Component = useOfflineWrapper()
    const wrapper = mount(Component)

    // First go offline
    window.dispatchEvent(new Event('offline'))
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.isOffline).toBe(true)

    // Then come back online
    window.dispatchEvent(new Event('online'))
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.isOffline).toBe(false)
    wrapper.unmount()
  })

  it('starts offline if navigator.onLine is false', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    const Component = useOfflineWrapper()
    const wrapper = mount(Component)

    expect(wrapper.vm.isOffline).toBe(true)
    wrapper.unmount()
  })
})
