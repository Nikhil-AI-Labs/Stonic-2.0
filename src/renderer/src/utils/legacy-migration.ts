/**
 * Legacy localStorage bridge for the IRIS -> STONIC 2.0 rebrand.
 *
 * All renderer-side keys moved from the `iris_` prefix to `stonic_` (API key vault,
 * cloud refresh token, voice profile, user name, ADB pairing). This copies any
 * surviving legacy entry across on first launch so the user re-enters nothing.
 *
 * Idempotent: a `stonic_` key that already exists always wins.
 */
export function migrateLegacyStorage(): void {
  try {
    const legacyKeys = Object.keys(localStorage).filter((key) => key.startsWith('iris_'))

    for (const legacyKey of legacyKeys) {
      const currentKey = `stonic_${legacyKey.slice('iris_'.length)}`
      const value = localStorage.getItem(legacyKey)

      if (value !== null && localStorage.getItem(currentKey) === null) {
        localStorage.setItem(currentKey, value)
      }
      localStorage.removeItem(legacyKey)
    }
  } catch (err) {
    // Migration is best-effort — never block the renderer from booting.
  }
}
