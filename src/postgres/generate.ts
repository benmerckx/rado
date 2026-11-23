import type {Database} from '../core/Database.ts'
import {type Generate, createGenerate, load} from '../core/Generate.ts'
import {connect} from '../driver/pglite.ts'
import {push} from './push.ts'

export type {GenerateOptions} from '../core/Generate.ts'

async function open(): Promise<Database> {
  const {PGlite} = await load(
    '@electric-sql/pglite',
    () => import('@electric-sql/pglite')
  )
  return connect(new PGlite())
}

export const generate: Generate<'postgres'> = createGenerate(push, open)
