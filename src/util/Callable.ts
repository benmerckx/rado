// This is based on https://github.com/WebReflection/custom-function/blob/31fd7271c86354c1b2f80618c2124ee143827e98/esm/index.js
// but we don't actually want the Function prototype so it's not included

const {setPrototypeOf} = Object

export class Callable {
  constructor(fn: Function) {
    return setPrototypeOf(fn, new.target.prototype)
  }
}

export declare class ClearFunctionProto {
  get name(): unknown
  get length(): unknown
  get call(): unknown
  get apply(): unknown
  get bind(): unknown
  get prototype(): unknown
}
