import {Process, Test} from '@sinclair/carbon'

import './core/Expr.test.ts'
import './core/Selection.test.ts'
import './core/Sql.test.ts'
import './core/SqliteFunctions.test.ts'
import './core/Table.test.ts'
import './driver/bun-sqlite.test.ts'
import './driver/pg.test.ts'
import './driver/pglite.test.ts'
import './driver/sql.js.test.ts'
import './query/CreateTable.test.ts'
import './query/Delete.test.ts'
import './query/DropTable.test.ts'
import './query/Insert.test.ts'
import './query/Select.test.ts'
import './query/Union.test.ts'
import './query/Update.test.ts'

Test.run({filter: Process.args[0]}).then(result => {
  return Process.exit(result.success ? 0 : 1)
})
