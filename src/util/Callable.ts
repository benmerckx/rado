// This is based on
// https://github.com/WebReflection/custom-function/blob/31fd7271c86354c1b2f80618c2124ee143827e98/esm/index.js
// but we don't actually want the Function prototype so it's not included.
// Which also means we don't need a super call and can just use a class.

const {setPrototypeOf} = Object

export class Callable {
  constructor(fn: Function) {
    return setPrototypeOf(fn, new.target.prototype)
  }
}

export declare class ClearFunctionProto {
  // Clear the Function prototype, not sure if there's a better way
  // as mapped types (Omit) will remove the callable signature. We define them
  // in a class getter since it's the only way to also mark them as
  // non-enumerable, see also: Microsoft/TypeScript#27575
  get name(): unknown
  get length(): unknown
  get call(): unknown
  get apply(): unknown
  get bind(): unknown
  get prototype(): unknown
}
