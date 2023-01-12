import {Expr, Fields} from '../src'

type Location = {lat: number; lng: number}

type ShouldBeRecord = Fields<{
  location: Location | null
}>

const test: ShouldBeRecord = undefined!
const shouldBeExpr: Expr<Location> = test.location
const shouldBeExprNumber: Expr<number> = test.location.lat
