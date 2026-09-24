import {suite} from '@alinea/suite'
import {ReusedStatement, StatementCache} from '#/sqlite/statements.ts'

interface Fake {
  sql: string
  finalized: number
}

function setup(size?: number) {
  const prepared: Array<Fake> = []
  const cache = new StatementCache<Fake>(
    sql => {
      const stmt = {sql, finalized: 0}
      prepared.push(stmt)
      return stmt
    },
    stmt => stmt.finalized++,
    size
  )
  const use = (sql: string) => {
    const statement = new ReusedStatement(cache, sql)
    statement.free()
    return prepared.length
  }
  return {cache, prepared, use}
}

suite(import.meta, test => {
  test('reuses statements by sql text', () => {
    const {prepared, use} = setup()
    use('select 1')
    use('select 2')
    use('select 1')
    test.equal(
      prepared.map(stmt => stmt.sql),
      ['select 1', 'select 2']
    )
    test.equal(
      prepared.map(stmt => stmt.finalized),
      [0, 0]
    )
  })

  test('evicts the least recently used statement', () => {
    const {prepared, use} = setup(2)
    use('select 1')
    use('select 2')
    use('select 1')
    use('select 3')
    test.equal(
      prepared.map(stmt => [stmt.sql, stmt.finalized]),
      [
        ['select 1', 0],
        ['select 2', 1],
        ['select 3', 0]
      ]
    )
    use('select 2')
    test.equal(prepared.length, 4)
  })

  test('statements in use are finalized once released', () => {
    const {cache, prepared, use} = setup(1)
    const held = new ReusedStatement(cache, 'select 1')
    use('select 2')
    test.equal(prepared[0]!.finalized, 0)
    held.free()
    test.equal(prepared[0]!.finalized, 1)
    held.free()
    test.equal(prepared[0]!.finalized, 1)
  })

  test('the same statement can be held more than once', () => {
    const {cache, prepared} = setup()
    const a = new ReusedStatement(cache, 'select 1')
    const b = new ReusedStatement(cache, 'select 1')
    test.equal(prepared.length, 1)
    cache.clear()
    a.free()
    test.equal(prepared[0]!.finalized, 0)
    b.free()
    test.equal(prepared[0]!.finalized, 1)
  })

  test('schema changes clear the cache', () => {
    const {cache, prepared, use} = setup()
    use('select * from a')
    use('alter table a add column b')
    test.equal(
      prepared.map(stmt => [stmt.sql, stmt.finalized]),
      [
        ['select * from a', 1],
        ['alter table a add column b', 1]
      ]
    )
    use('select * from a')
    test.equal(prepared.length, 3)
    cache.invalidate('insert into a values (1)')
    use('select * from a')
    test.equal(prepared.length, 3)
    cache.invalidate('  DROP table b')
    use('select * from a')
    test.equal(prepared.length, 4)
  })

  test('clear finalizes idle statements', () => {
    const {cache, prepared, use} = setup()
    use('select 1')
    use('select 2')
    cache.clear()
    test.equal(
      prepared.map(stmt => stmt.finalized),
      [1, 1]
    )
  })
})
