import {Expr, Fields, ObjectExpr, Table, column, table} from '../src/index.js'

type Location = {lat: number; lng: number}

type ShouldBeRecord = Fields<{
  location: Location | null
}>

const test: ShouldBeRecord = undefined!
const shouldBeObjExpr: ObjectExpr = test.location
const shouldBeExprNumber: Expr<number> = test.location.lat

type Base = {
  isOptional?: boolean
}

type Item = ({type: 'test'; x: 1} & Base) | {type: 'test2'; y: 2; here: string}

type TestTypes = Fields<{
  item: Item
}>

const test2: TestTypes = undefined!
const typeAccessible: Expr<boolean> = test2.item.type.is('test')
//    ^?

function definitionAndRow<T extends {id: number}>(table: Table.Of<T>, row: T) {
  return undefined!
}

const Example = table({
  Example: class {
    id = column.integer().primaryKey()
    name = column.object<{
      sub: {
        sub: string
      }
    }>()
  }
})
type Example = table<typeof Example>

const x = Example({id: 1}).select({name: Example.name})

definitionAndRow<Example>(Example, {id: 1, name: {sub: {sub: 'test'}}})

type Row = Table.Select<typeof Example>
//   ^?

type TableOfExample = Table.Of<Example>

const tableOfExampleInstance: TableOfExample = undefined!

tableOfExampleInstance({id: 123})
tableOfExampleInstance.name.sub
