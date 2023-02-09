export class Callable extends Function {
  constructor(fn: Function) {
    super()
    return new Proxy(this, {
      apply(_, thisArg, input) {
        return fn.apply(thisArg, input)
      }
    })
  }
}
