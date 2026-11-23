import type {Database} from '../core/Database.ts'
import {type Generate, createGenerate} from '../core/Generate.ts'
import {connect as bun} from '../driver/bun-sqlite.ts'
import {connect as node} from '../driver/node-sqlite.ts'
import {push} from './push.ts'

export type {GenerateOptions} from '../core/Generate.ts'

// The runtime's own sqlite, so there is nothing to install
async function open(): Promise<Database> {
  if ('Bun' in globalThis) {
    const {Database} = await import('bun:sqlite')
    return bun(new Database(':memory:'))
  }
  // Typed by hand, the node types aren't installed
  const {
    DatabaseSync
  }: {
    DatabaseSync: new (path: string) => Parameters<typeof node>[0]
  } = await import('node:sqlite' as string)
  return node(new DatabaseSync(':memory:'))
}

export const generate: Generate<'sqlite'> = createGenerate(push, open)
