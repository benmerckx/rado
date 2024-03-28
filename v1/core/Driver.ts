import type {Emitter} from './Emitter.ts'
import type {QueryMeta} from './Query.ts'

export type Driver<Meta extends QueryMeta> = Meta['mode'] extends 'sync'
  ? SyncDriver
  : AsyncDriver

export interface SyncDriver {
  emitter: Emitter
  close(): void
  exec(query: string): void
  prepare(query: string): SyncStatement
  transaction<T>(run: () => T, options: unknown, depth: number): T
}
export interface SyncStatement {
  all(params: Array<unknown>): Array<unknown>
  run(params: Array<unknown>): void
  get(params: Array<unknown>): unknown
  values(params: Array<unknown>): Array<Array<unknown>>
  free(): void
}
export interface AsyncDriver {
  emitter: Emitter
  close(): Promise<void>
  exec(query: string): Promise<void>
  prepare(query: string): AsyncStatement
  transaction<T>(run: () => T, options: unknown, depth: number): Promise<T>
}
export interface AsyncStatement {
  all(params: Array<unknown>): Promise<Array<unknown>>
  run(params: Array<unknown>): Promise<void>
  get(params: Array<unknown>): Promise<unknown>
  values(params: Array<unknown>): Promise<Array<Array<unknown>>>
  free(): void
}
