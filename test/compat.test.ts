import {isBun} from './TestRuntime.ts'

if (isBun) {
  await import('./compat/sqlite-common.ts')
  await import('./compat/postgres-common.ts')
  await import('./compat/mysql-common.ts')
}
