const legacyPrConfigStoragePrefix = 'knighted:develop:github-pr-config:'

const clearLegacyPrConfigStorage = ({
  storage = localStorage,
  prefix = legacyPrConfigStoragePrefix,
} = {}) => {
  try {
    const keysToRemove = []

    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (!key || !key.startsWith(prefix)) {
        continue
      }

      keysToRemove.push(key)
    }

    for (const key of keysToRemove) {
      storage.removeItem(key)
    }
  } catch {
    /* noop */
  }
}

export { clearLegacyPrConfigStorage, legacyPrConfigStoragePrefix }
