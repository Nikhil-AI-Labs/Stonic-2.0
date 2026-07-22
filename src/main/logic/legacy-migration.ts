import fs from 'fs'
import path from 'path'
import { App } from 'electron'
import Store from 'electron-store'

const StoreClass = (Store as any).default || Store

/**
 * Legacy data bridge for the IRIS -> STONIC 2.0 rebrand.
 *
 * Two things moved at once:
 *   1. Every persisted key / filename lost its `iris_` prefix in favour of `stonic_`.
 *   2. The app was renamed, so Electron now resolves `userData` to a *different*
 *      directory ("STONIC 2.0" / "stonic-2.0" instead of "IRIS AI" / "iris-ai").
 *
 * So we look for legacy data in the old app-data folders as well as the current
 * one, and adopt it. This preserves the API key vault, PIN hash, Face ID
 * enrollment, chat memory and saved workflows across the rename.
 *
 * Runs once at startup; a no-op on a clean install or after it has already run.
 */

// Pre-rebrand app-data folder names, checked as siblings of the current userData dir.
const LEGACY_APP_DIRS = ['IRIS AI', 'iris-ai']

// [legacy name, current name] — covers both files and directories.
const PATH_MIGRATIONS: [string, string][] = [
  ['iris_secure_vault.json', 'stonic_secure_vault.json'],
  ['iris_semantic_db', 'stonic_semantic_db'],
  ['iris_workflows.json', 'stonic_workflows.json'],
  ['iris_scan_states', 'stonic_scan_states'],
  [path.join('Chat', 'iris_memory.json'), path.join('Chat', 'stonic_memory.json')],
  // electron-store's backing file — unprefixed, so it only needs the folder hop.
  ['config.json', 'config.json']
]

// electron-store keys: [legacy, current]
const STORE_KEY_MIGRATIONS: [string, string][] = [
  ['iris_vault_face', 'stonic_vault_face'],
  ['iris_vault_faces', 'stonic_vault_faces'],
  ['iris_vault_hash', 'stonic_vault_hash'],
  ['iris_personality', 'stonic_personality']
]

function copyRecursive(from: string, to: string): void {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  // fs.cpSync handles both files and directory trees.
  fs.cpSync(from, to, { recursive: true })
}

export default function migrateLegacyData(app: App): void {
  const userData = app.getPath('userData')
  const appDataRoot = path.dirname(userData)

  // Search the current userData dir first, then any surviving pre-rename folder.
  const searchRoots = [
    userData,
    ...LEGACY_APP_DIRS.map((dir) => path.join(appDataRoot, dir)).filter(
      (dir) => path.resolve(dir) !== path.resolve(userData)
    )
  ]

  for (const [legacyName, currentName] of PATH_MIGRATIONS) {
    try {
      const target = path.join(userData, currentName)

      // Never clobber live data — only adopt legacy data when nothing is there yet.
      if (fs.existsSync(target)) continue

      for (const root of searchRoots) {
        const source = path.join(root, legacyName)
        if (!fs.existsSync(source) || path.resolve(source) === path.resolve(target)) continue

        if (path.resolve(root) === path.resolve(userData)) {
          // Same folder: a plain rename is enough.
          fs.mkdirSync(path.dirname(target), { recursive: true })
          fs.renameSync(source, target)
        } else {
          // Old install folder: copy so the previous version stays intact as a backup.
          copyRecursive(source, target)
        }
        break
      }
    } catch (err) {
      // A failed migration must never block boot; the app falls back to empty state.
    }
  }

  try {
    const store = new StoreClass()
    for (const [legacyKey, currentKey] of STORE_KEY_MIGRATIONS) {
      const value = store.get(legacyKey)
      if (value === undefined) continue

      if (store.get(currentKey) === undefined) store.set(currentKey, value)
      store.delete(legacyKey)
    }
  } catch (err) {
    // Same policy: vault migration failure degrades to re-enrollment, not a crash.
  }
}
