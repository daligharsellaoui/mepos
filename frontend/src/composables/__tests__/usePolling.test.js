import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { usePolling } from '../usePolling'

function usePollingWrapper(fetcher, intervalMs, enabled) {
  return defineComponent({
    setup() {
      return usePolling(fetcher, intervalMs, enabled)
    },
    template: '<div>{{ data }} {{ loading }} {{ error }}</div>'
  })
}

describe('usePolling composable', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls fetcher on mount and sets data', async () => {
    const fetcher = vi.fn().mockResolvedValue({ status: 'success', data: { items: [1, 2] } })
    const Component = usePollingWrapper(fetcher, 5000)
    const wrapper = mount(Component)

    expect(wrapper.vm.loading).toBe(true)

    vi.advanceTimersByTime(0)
    await flushPromises()

    expect(fetcher).toHaveBeenCalledOnce()
    expect(wrapper.vm.data).toEqual({ items: [1, 2] })
    expect(wrapper.vm.loading).toBe(false)
    wrapper.unmount()
  })

  it('sets error on fetcher failure', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('Network error'))
    const Component = usePollingWrapper(fetcher, 5000)
    const wrapper = mount(Component)

    vi.advanceTimersByTime(0)
    await flushPromises()

    expect(wrapper.vm.error).toBe('Network error')
    expect(wrapper.vm.loading).toBe(false)
    wrapper.unmount()
  })

  it('polls at the specified interval', async () => {
    const fetcher = vi.fn().mockResolvedValue({ status: 'success', data: 'test' })
    const Component = usePollingWrapper(fetcher, 3000)
    const wrapper = mount(Component)

    vi.advanceTimersByTime(0)
    await flushPromises()
    expect(fetcher).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(3000)
    await flushPromises()
    expect(fetcher).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(3000)
    await flushPromises()
    expect(fetcher).toHaveBeenCalledTimes(3)
    wrapper.unmount()
  })

  it('does not poll when enabled is false', async () => {
    const fetcher = vi.fn().mockResolvedValue({ status: 'success', data: 'test' })
    const Component = usePollingWrapper(fetcher, 3000, false)
    const wrapper = mount(Component)

    vi.advanceTimersByTime(10000)
    await flushPromises()

    expect(fetcher).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('returns error message from fetcher error', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('Custom error'))
    const Component = usePollingWrapper(fetcher, 5000)
    const wrapper = mount(Component)

    vi.advanceTimersByTime(0)
    await flushPromises()

    expect(wrapper.vm.error).toBe('Custom error')
    wrapper.unmount()
  })

  it('keeps data null when fetcher returns non-success status', async () => {
    const fetcher = vi.fn().mockResolvedValue({ status: 'error', message: 'Not found' })
    const Component = usePollingWrapper(fetcher, 5000)
    const wrapper = mount(Component)

    vi.advanceTimersByTime(0)
    await flushPromises()

    expect(wrapper.vm.data).toBeNull()
    wrapper.unmount()
  })

  it('exposes refresh function for manual re-fetch', async () => {
    const fetcher = vi.fn().mockResolvedValue({ status: 'success', data: 'initial' })
    const Component = usePollingWrapper(fetcher, 5000)
    const wrapper = mount(Component)

    vi.advanceTimersByTime(0)
    await flushPromises()
    expect(wrapper.vm.data).toBe('initial')

    fetcher.mockResolvedValue({ status: 'success', data: 'updated' })
    wrapper.vm.refresh()
    await flushPromises()
    expect(wrapper.vm.data).toBe('updated')
    wrapper.unmount()
  })
})
