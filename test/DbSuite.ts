import sqlite from '@alinea/sqlite-wasm'
import BetterSqlite3Database from 'better-sqlite3'
import {
  createBetterSqlite3Connection,
  createSqlJsConnection
} from '../src/sqlite'

const {Database} = await sqlite()

const useWasm = false

function createBetterSqlite3Db() {
  return createBetterSqlite3Connection(new BetterSqlite3Database(':memory:'))
}

function createSqliteJsDb() {
  return createSqlJsConnection(new Database())
}

export function createConnection() {
  return useWasm ? createSqliteJsDb() : createBetterSqlite3Db()
}
