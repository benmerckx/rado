import {suite} from '@alinea/suite'
import {lines} from '#/sqlite/lines.ts'

const test = suite(import.meta)

test('lines puts each statement on a line', () => {
  test.equal(
    lines('-- a\n\ncreate table t (\n  id integer -- key\n);\nselect 1;'),
    'create table t (   id integer  );\nselect 1;'
  )
})

test('lines keeps literals and quoted names', () => {
  test.equal(
    lines('insert into t values (\'a;\n-- b\');\nselect "x;y", [z;];'),
    'insert into t values (\'a;\n-- b\');\nselect "x;y", [z;];'
  )
})

test('lines with crlf and block comments', () => {
  test.equal(lines('select 1;\r\n\r\nselect 2;'), 'select 1;\nselect 2;')
  test.equal(
    lines("select /* it's; */ 1;\n-- 'x\nselect 2;"),
    'select   1;\nselect 2;'
  )
})

test('lines keeps a trigger body whole', () => {
  const trigger = [
    'create trigger t after insert on a begin',
    '  update a set v = case when v then 1 else 0 end;',
    '  delete from b;',
    'end;',
    'select 1;'
  ].join('\n')
  test.equal(
    lines(trigger),
    'create trigger t after insert on a begin   update a set v = case when v then 1 else 0 end;   delete from b; end;\nselect 1;'
  )
})
