import {Expr, Fields} from '../src'

type Location = {lat: number; lng: number}

type ShouldBeRecord = Fields<{
  location: Location | null
}>

const test: ShouldBeRecord = undefined!
const shouldBeExpr: Expr<Location> = test.location
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
