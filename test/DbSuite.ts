import {Driver, DriverOptions} from '../src/index.js'

export async function connect(
  options: DriverOptions = {}
): Promise<Driver.Async> {
  switch (process.env.TEST_DRIVER) {
    case 'bun:sqlite': {
      const {Database} = await import('bun:sqlite')
      const {connect: createConnection} = await import(
        '../src/driver/bun-sqlite.js'
      )
      return createConnection(new Database(':memory:'), options).toAsync()
    }
    case 'better-sqlite3': {
      const {default: Database} = await import('better-sqlite3')
      const {connect: createConnection} = await import(
        '../src/driver/better-sqlite3.js'
      )
      return createConnection(new Database(':memory:'), options).toAsync()
    }
    case 'sql.js': {
      const {default: init} = await import('sql.js')
      const {Database} = await init()
      const {connect: createConnection} = await import(
        '../src/driver/sql.js.js'
      )
      return createConnection(new Database(), options).toAsync()
    }
    case 'sqlite3': {
      const {
        default: {Database}
      } = await import('sqlite3')
      const {connect: createConnection} = await import(
        '../src/driver/sqlite3.js'
      )
      return createConnection(new Database(':memory:'), options)
    }
    default:
      throw new Error(`Unknown driver ${process.env.TEST_DRIVER}`)
  }
}
