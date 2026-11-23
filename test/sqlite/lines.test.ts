import {suite} from '@alinea/suite'
import {lines} from '#/sqlite/lines.ts'

const test = suite(import.meta)

test('lines drops blank and comment lines', () => {
  test.equal(
    lines('-- a\n\nselect 1;\n  -- b\nselect 2; -- c'),
    'select 1;\nselect 2; -- c'
  )
})

test('lines keeps literals that span lines', () => {
  const query =
    "insert into t values ('a\n-- b\n\nc'); -- 'x\n-- d\nselect 'it''s';"
  test.equal(
    lines(query),
    "insert into t values ('a\n-- b\n\nc'); -- 'x\nselect 'it''s';"
  )
})

test('lines with crlf and block comments', () => {
  test.equal(
    lines('-- a\r\n\r\nselect 1;\r\nselect 2;'),
    'select 1;\nselect 2;'
  )
  const query = "select /* it's */ 1;\n-- 'x\nselect 2;"
  test.equal(lines(query), "select /* it's */ 1;\nselect 2;")
})
