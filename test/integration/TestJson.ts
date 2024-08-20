import {eq, type Database} from '@/index.ts'
import type {DefineTest} from '@benmerckx/suite'
import {WithJson} from './schema.ts'

export async function testJson(db: Database, test: DefineTest) {
  try {
    await db.create(WithJson)
    const data = {sub: {field: 'value'}, arr: [1, 2, 3]}
    await db.insert(WithJson).values({data})
    const [row] = await db
      .select()
      .from(WithJson)
      .where(eq(WithJson.data.sub.field, 'value'), eq(WithJson.data.arr[0], 1))
    test.equal(row, {id: 1, data})
  } finally {
    await db.drop(WithJson)
  }
}
