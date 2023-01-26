import {Driver} from '../src'

export async function connect(): Promise<Driver.Async> {
  switch (process.env.TEST_DRIVER) {
    case 'bun:sqlite': {
      const {Database} = await import('bun:sqlite')
      const {connect: createConnection} = await import(
        '../src/driver/bun:sqlite'
      )
      return createConnection(new Database(':memory:')).toAsync()
    }
    case 'better-sqlite3': {
      const {default: Database} = await import('better-sqlite3')
      const {connect: createConnection} = await import(
        '../src/driver/better-sqlite3'
      )
      return createConnection(new Database(':memory:')).toAsync()
    }
    case 'sql.js': {
      const {default: init} = await import('sql.js')
      const {Database} = await init()
      const {connect: createConnection} = await import('../src/driver/sql.js')
      return createConnection(new Database()).toAsync()
    }
    case 'sqlite3': {
      const {
        default: {Database}
      } = await import('sqlite3')
      const {connect: createConnection} = await import('../src/driver/sqlite3')
      return createConnection(new Database(':memory:'))
    }
    default:
      throw new Error(`Unknown driver ${process.env.TEST_DRIVER}`)
  }
}
