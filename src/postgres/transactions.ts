import type {TransactionOptions} from '../core/Database.ts'

export function setTransaction(
  options: TransactionOptions['postgres']
): string {
  return [
    'set transaction',
    options.isolationLevel && `isolation level ${options.isolationLevel}`,
    options.accessMode,
    options.deferrable ? 'deferrable' : 'not deferrable'
  ]
    .filter(Boolean)
    .join(' ')
}
