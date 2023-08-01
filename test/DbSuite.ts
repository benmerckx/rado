import {Driver, DriverOptions} from '../src/index.js'

export async function connect(
  options: DriverOptions = {}
): Promise<Driver.Async> {
  switch (process.env.TEST_DRIVER) {
    case 'bun:sqlite': {
      const {Database} = await import('bun:sqlite')
      const {connect} = await import('../src/driver/bun-sqlite.js')
      return connect(new Database(':memory:'), options).toAsync()
    }
    case 'better-sqlite3': {
      const {default: Database} = await import('better-sqlite3')
      const {connect} = await import('../src/driver/better-sqlite3.js')
      return connect(new Database(':memory:'), options).toAsync()
    }
    case 'sql.js': {
      const {default: init} = await import('sql.js')
      const {Database} = await init()
      const {connect} = await import('../src/driver/sql.js.js')
      return connect(new Database(), options).toAsync()
    }
    case '@sqlite.org/sqlite-wasm': {
      const {default: init} = await import('@sqlite.org/sqlite-wasm')
      const sqlite3 = await init({
        print: console.log.bind(console),
        printErr: console.error.bind(console)
      })
      const {connect} = await import('../src/driver/@sqlite.org/sqlite-wasm.js')
      return connect(new sqlite3.oo1.DB(':memory:', 'ct'), options).toAsync()
    }
    case 'sqlite3': {
      const {
        default: {Database}
      } = await import('sqlite3')
      const {connect} = await import('../src/driver/sqlite3.js')
      return connect(new Database(':memory:'), options)
    }
    case 'd1': {
      const {connect} = await import('../src/driver/d1.js')
      // @ts-ignore
      return connect(env.DB, options)
    }
    default:
      throw new Error(`Unknown driver ${process.env.TEST_DRIVER}`)
  }
}
