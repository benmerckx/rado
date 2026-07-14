import {isBun, testMysql} from './TestRuntime.ts'

if (isBun)
  if (testMysql) {
    await import('./compat/mysql-common.ts')
  } else {
    await import('./compat/sqlite-common.ts')
    await import('./compat/postgres-common.ts')
  }
