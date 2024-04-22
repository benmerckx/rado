export class NamedParam {
  constructor(public name: string) {}
}
export class ValueParam {
  constructor(public value: unknown) {}
}
export type Param = NamedParam | ValueParam
