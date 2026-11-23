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

test('lines with an end column and parameters', () => {
  const trigger = [
    'create trigger t after insert on a begin',
    '  update a set end = 1, v = case when $case then 1 end;',
    'end;',
    'select :case, @case;',
    'select 2;'
  ].join('\n')
  test.equal(
    lines(trigger),
    'create trigger t after insert on a begin   update a set end = 1, v = case when $case then 1 end; end;\nselect :case, @case;\nselect 2;'
  )
})

test('lines closes a trigger before a commented semicolon', () => {
  const trigger = [
    'create trigger t after insert on a begin',
    '  delete from b;',
    'end -- done',
    '/* really */;',
    'select 1;'
  ].join('\n')
  test.equal(
    lines(trigger),
    'create trigger t after insert on a begin   delete from b; end;\nselect 1;'
  )
  // A keyword at the very start counts, nothing precedes it
  test.equal(lines('case; end;\nselect 2;'), 'case; end;\nselect 2;')
})
