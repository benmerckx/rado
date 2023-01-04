import {Connection} from '../src/Connection'

export async function connect(): Promise<Connection> {
  switch (process.env.TEST_DRIVER) {
    case 'better-sqlite3': {
      const {default: BetterSqlite3Database} = await import('better-sqlite3')
      const {createConnection} = await import('../src/driver/better-sqlite3')
      return createConnection(new BetterSqlite3Database(':memory:'))
    }
    case 'sql.js': {
      const {init} = await import('@alinea/sqlite-wasm')
      const {Database} = await init()
      const {createConnection} = await import('../src/driver/sql.js')
      return createConnection(new Database())
    }
    case 'sqlite3': {
      const {
        default: {Database}
      } = await import('sqlite3')
      const {createConnection} = await import('../src/driver/sqlite3')
      return createConnection(new Database(':memory:'))
    }
    default:
      throw new Error(`Unknown driver ${process.env.TEST_DRIVER}`)
  }
}
