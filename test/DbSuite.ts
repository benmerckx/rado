import sqlite from '@alinea/sqlite-wasm'
import BetterSqlite3Database from 'better-sqlite3'
import {createConnection as createBetterSqlite3Connection} from '../src/driver/better-sqlite3'
import {createConnection as createSqlJsConnection} from '../src/driver/sql.js'

const {Database} = await sqlite()

const useWasm = false

function createBetterSqlite3Db() {
  return createBetterSqlite3Connection(new BetterSqlite3Database(':memory:'))
}

function createSqliteJsDb() {
  return createSqlJsConnection(new Database())
}

export function connect() {
  return useWasm ? createSqliteJsDb() : createBetterSqlite3Db()
}
