import * as driver from '@/driver.ts'
import {type DefineTest, type Describe, suite} from '@alinea/suite'
import {isBun, isCi, isDeno, isNode} from './TestRuntime.ts'
import {testBasic} from './integration/TestBasic.ts'
import {testBatch} from './integration/TestBatch.ts'
import {testCTE} from './integration/TestCTE.ts'
import {testColumns} from './integration/TestColumns.ts'
import {testConflicts} from './integration/TestConflicts.ts'
import {testConstraints} from './integration/TestConstraints.ts'
import {testInclude} from './integration/TestInclude.ts'
import {testJoins} from './integration/TestJoins.ts'
import {testJson} from './integration/TestJson.ts'
import {testMigration} from './integration/TestMigration.ts'
import {testPreparedQuery} from './integration/TestPreparedQuery.ts'
import {testSubquery} from './integration/TestSubquery.ts'
import {testTransactions} from './integration/TestTransactions.ts'

const mysqlConnection = 'mysql://root:mysql@localhost:3306/mysql'
const pgConnection = 'postgres://postgres:postgres@localhost:5432/postgres'

const init = {
  'better-sqlite3': {
    condition: isNode,
    async client() {
      const {default: Database} = await import('better-sqlite3')
      return new Database(':memory:')
    }
  },
  'bun:sqlite': {
    condition: isBun,
    async client() {
      const {Database} = await import('bun:sqlite')
      return new Database(':memory:')
    }
  },
  mysql2: {
    condition: isCi,
    async client() {
      const {default: mysql2} = await import('mysql2')
      const client = mysql2.createConnection(mysqlConnection)
      return client
    }
  },
  '@electric-sql/pglite': {
    condition: !isDeno,
    async client() {
      const {PGlite} = await import('@electric-sql/pglite')
      return new PGlite()
    }
  },
  pg: {
    condition: isCi,
    async client() {
      const {default: pg} = await import('pg')
      const client = new pg.Client({
        connectionString: pgConnection
      })
      await client.connect()
      return client
    }
  },
  'sql.js': {
    condition: true,
    async client() {
      const {default: init} = await import('sql.js')
      const {Database} = await init()
      return new Database()
    }
  },
  '@vercel/postgres': {
    condition: isCi,
    async client() {
      const {neonConfig} = await import('@neondatabase/serverless')
      Object.assign(neonConfig, {
        wsProxy: () => 'localhost:5488/v1',
        useSecureWebSocket: false,
        pipelineTLS: false,
        pipelineConnect: false
      })
      const {createClient} = await import('@vercel/postgres')
      const client = createClient({
        connectionString: pgConnection
      })
      await client.connect()
      return client
    }
  },
  d1: {
    condition: isNode,
    async client() {
      const {createSQLiteDB} = await import('@miniflare/shared')
      const {D1Database, D1DatabaseAPI} = await import('@miniflare/d1')
      return new D1Database(new D1DatabaseAPI(await createSQLiteDB(':memory:')))
    }
  },
  '@libsql/client': {
    condition: !isDeno,
    async client() {
      const {createClient} = await import('@libsql/client')
      return createClient({
        url: 'file::memory:?cache=shared'
      })
    }
  }
}

async function createTests() {
  const clients = await Promise.all(
    Object.entries(init)
      .filter(([name, meta]) => meta.condition)
      .map(
        async ([name, meta]) =>
          [name, await meta.client()] as [keyof typeof init, any]
      )
  )
  return (test: DefineTest) => {
    for (const [name, client] of clients) {
      const db = driver[name](client)
      const prefixed: Describe = (description, fn) =>
        test(`${name}: ${description}`, fn)
      const withName = Object.assign(prefixed, test)

      testBasic(db, withName)
      testBatch(db, withName)
      testColumns(db, withName)
      testSubquery(db, withName)
      testPreparedQuery(db, withName)
      testJoins(db, withName)
      testJson(db, withName)
      testConstraints(db, withName)
      testCTE(db, withName)
      testInclude(db, withName)
      testConflicts(db, withName)
      if (!db.driver.supportsTransactions) continue
      testTransactions(db, withName)
      testMigration(db, withName)
    }
  }
}

suite(import.meta, await createTests())
