export function callable(target: any, call: Function) {
  return new Proxy<any>(call, {
    set(_, prop, value) {
      target[prop] = value
      return true
    },
    get(_, prop) {
      return target[prop]
    }
  })
}
