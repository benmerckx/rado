import type {TransactionOptions} from '../core/Database.ts'

export function startTransaction(options: TransactionOptions['mysql']): string {
  return [
    'start transaction',
    options.withConsistentSnapshot && 'with consistent snapshot',
    options.accessMode
  ]
    .filter(Boolean)
    .join(' ')
}

export function setTransaction(
  options: TransactionOptions['mysql']
): string | undefined {
  if (!options.isolationLevel) return
  return [
    'set transaction',
    options.isolationLevel && `isolation level ${options.isolationLevel}`
  ]
    .filter(Boolean)
    .join(' ')
}
