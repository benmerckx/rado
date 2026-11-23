import type {Database} from '../core/Database.ts'
import {type Generate, createGenerate, load} from '../core/Generate.ts'
import {connect} from '../driver/mysql-wasm.ts'
import {migrator} from './migrate.ts'
import {push} from './push.ts'

export type {GenerateOptions} from '../core/Generate.ts'

async function open(): Promise<Database> {
  const {MySQL} = await load('mysql-wasm', () => import('mysql-wasm'))
  return connect(await MySQL.create())
}

export const generate: Generate<'mysql'> = createGenerate(push, migrator, open)
