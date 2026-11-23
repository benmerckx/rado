import {readdir, readFile} from 'node:fs/promises'
import {join} from 'node:path'
import type {Migrations} from '../core/Migrate.ts'

export async function read(dir: string): Promise<Migrations> {
  const files = (await readdir(dir)).filter(file => file.endsWith('.sql'))
  const contents = await Promise.all(
    files.map(file => readFile(join(dir, file), 'utf8'))
  )
  return Object.fromEntries(files.map((file, i) => [file, contents[i]]))
}
