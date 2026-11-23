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

// Placeholders are plain Sql. Their names are kept here, out of the public
// api, so a column can map the inputs given for them.
export const placeholders: WeakMap<object, string> = new WeakMap()
