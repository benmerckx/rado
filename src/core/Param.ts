export type ParamMapper = (value: unknown) => unknown

export class NamedParam {
  constructor(
    public name: string,
    public map?: ParamMapper
  ) {}
}
export class ValueParam {
  constructor(public value: unknown) {}
}
export type Param = NamedParam | ValueParam
