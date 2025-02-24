import {isBun} from './TestRuntime.ts'

if (isBun) await import('./compat/sqlite-common.ts')
