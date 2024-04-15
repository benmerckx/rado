export type Driver = SyncDriver | AsyncDriver
export type Statement = SyncStatement | AsyncStatement

export interface SyncDriver {
  close(): void
  exec(query: string): void
  prepare(query: string): SyncStatement
  transaction<T>(
    run: (inner: SyncDriver) => T,
    options: unknown,
    depth: number
  ): T
}
export interface SyncStatement {
  all(params: Array<unknown>): Array<object>
  run(params: Array<unknown>): void
  get(params: Array<unknown>): object | null
  values(params: Array<unknown>): Array<Array<unknown>>
  free(): void
}
export interface AsyncDriver {
  close(): Promise<void>
  exec(query: string): Promise<void>
  prepare(query: string): AsyncStatement
  transaction<T>(
    run: (inner: AsyncDriver) => Promise<T>,
    options: unknown,
    depth: number
  ): Promise<T>
}
export interface AsyncStatement {
  all(params: Array<unknown>): Promise<Array<object>>
  run(params: Array<unknown>): Promise<void>
  get(params: Array<unknown>): Promise<object | null>
  values(params: Array<unknown>): Promise<Array<Array<unknown>>>
  free(): void
}
