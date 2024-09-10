import {eq, type Database} from '@/index.ts'
import type {DefineTest} from '@alinea/suite'
import {WithJson} from './schema.ts'

export function testJson(db: Database, test: DefineTest) {
  test('json', async () => {
    await db.create(WithJson)
    try {
      const data = {str: 'string', sub: {field: 'value'}, arr: [1, 2, 3]}
      await db.insert(WithJson).values({data})
      const [row] = await db
        .select({
          id: WithJson.id,
          str: WithJson.data.str,
          sub: WithJson.data.sub,
          arr: WithJson.data.arr
        })
        .from(WithJson)
        .where(
          eq(WithJson.data.sub.field, 'value'),
          eq(WithJson.data.arr[0], 1)
        )
      test.equal(row, {id: 1, ...data})
    } finally {
      await db.drop(WithJson)
    }
  })
}
