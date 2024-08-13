import type {TransactionOptions} from '../core/Database.ts'
import type {SyncDriver} from '../core/Driver.ts'

const locks = new WeakMap<SyncDriver, Promise<void>>()

export function execTransaction<T>(
  driver: SyncDriver,
  depth: number,
  wrap: (depth: number) => SyncDriver,
  run: (inner: SyncDriver) => T,
  options: TransactionOptions['sqlite']
): T {
  const needsLock = options.async
  const behavior = options.behavior ?? 'deferred'
  if (!needsLock) return transact()
  let trigger!: () => void
  const lock = new Promise<void>(resolve => (trigger = resolve))
  const current = Promise.resolve(locks.get(driver))
  locks.set(driver, lock)
  return current.then(transact).finally(trigger) as T

  function transact(): T {
    try {
      driver.exec(depth > 0 ? `savepoint d${depth}` : `begin ${behavior}`)
      const result = run(wrap(depth + 1))
      if (result instanceof Promise) return result.then(release, rollback) as T
      return release(result)
    } catch (error) {
      return rollback(error)
    }
  }

  function release(result: T): T {
    driver.exec(depth > 0 ? `release d${depth}` : 'commit')
    return result
  }

  function rollback(error: any): never {
    driver.exec(depth > 0 ? `rollback to d${depth}` : 'rollback')
    throw error
  }
}
