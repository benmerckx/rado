import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {suite} from '@alinea/suite'
import {read} from '#/migrate/fs.ts'

const test = suite(import.meta)

test('read migrations from a directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rado-'))
  try {
    await writeFile(join(dir, '0001_init.sql'), 'select 1;')
    await writeFile(join(dir, 'notes.md'), 'skip')
    test.equal(await read(dir), {'0001_init.sql': 'select 1;'})
  } finally {
    await rm(dir, {recursive: true})
  }
})
