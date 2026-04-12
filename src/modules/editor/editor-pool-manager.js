const toTabId = value =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : ''

export const createEditorPoolManager = ({ maxMounted = 2, onEvict } = {}) => {
  const registrations = new Map()
  const mru = []

  const touch = tabId => {
    const id = toTabId(tabId)

    if (!id) {
      return
    }

    const existingIndex = mru.indexOf(id)
    if (existingIndex >= 0) {
      mru.splice(existingIndex, 1)
    }

    mru.unshift(id)
  }

  const getMountedIds = () =>
    mru.filter(tabId => {
      const registration = registrations.get(tabId)
      return registration?.isMounted?.() === true
    })

  const evictIfNeeded = () => {
    const mounted = getMountedIds()

    while (mounted.length > maxMounted) {
      const tabId = mounted[mounted.length - 1]
      const registration = registrations.get(tabId)

      if (!registration || typeof registration.unmount !== 'function') {
        break
      }

      registration.unmount()
      mounted.pop()
      onEvict?.(tabId)
    }
  }

  const register = (tabId, registration) => {
    const id = toTabId(tabId)

    if (!id || !registration || typeof registration !== 'object') {
      return false
    }

    registrations.set(id, registration)
    touch(id)
    evictIfNeeded()
    return true
  }

  const activate = tabId => {
    const id = toTabId(tabId)

    if (!id) {
      return false
    }

    const registration = registrations.get(id)
    if (!registration) {
      return false
    }

    if (!registration.isMounted?.() && typeof registration.mount === 'function') {
      registration.mount()
    }

    touch(id)
    evictIfNeeded()
    return true
  }

  return {
    register,
    activate,
    getMountedIds,
    getMruIds: () => [...mru],
  }
}
