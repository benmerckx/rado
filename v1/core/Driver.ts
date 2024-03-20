import type {Emitter} from './Emitter.ts'
import type {QueryMode} from './Query.ts'

export type Driver<Mode extends QueryMode> = Mode extends 'sync'
  ? SyncDriver
  : AsyncDriver

export interface SyncDriver {
  emitter: Emitter
  close(): void
  exec(query: string): void
  prepare(query: string): SyncStatement
}
export interface SyncStatement {
  all(params: Array<unknown>): Array<unknown>
  run(params: Array<unknown>): void
  get(params: Array<unknown>): unknown
}
export interface AsyncDriver {
  emitter: Emitter
  close(): Promise<void>
  exec(query: string): Promise<void>
  prepare(query: string): AsyncStatement
}
export interface AsyncStatement {
  all(params: Array<unknown>): Promise<Array<unknown>>
  run(params: Array<unknown>): Promise<void>
  get(params: Array<unknown>): Promise<unknown>
}
