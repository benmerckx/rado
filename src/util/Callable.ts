const {setPrototypeOf} = Object

export class Callable {
  constructor(fn: Function) {
    return setPrototypeOf(fn, new.target.prototype)
  }
}
