export const isBun = 'Bun' in globalThis
export const isNode = !isBun && 'process' in globalThis
export const isDeno = 'Deno' in globalThis

const global = globalThis as any

type AssertEqual = (a: any, b: any) => void
type DefineTest = (name: string, run: () => Promise<void> | void) => void
type DefineSuite = (options: {test: DefineTest; isEqual: AssertEqual}) => void

let test: DefineTest
let isEqual: (a: any, b: any) => void

if (isBun) {
  const {expect} = await import('bun:test')
  isEqual = (a, b) => expect(a).toEqual(b)
} else if (isNode) {
  const {test: nodeTest} = await import('node:test')
  const {deepStrictEqual} = await import('node:assert')
  test = nodeTest
  isEqual = deepStrictEqual
} else if (isDeno) {
  // @ts-ignore
  const {assertEquals} = await import('https://deno.land/std/assert/mod.ts')
  test = global.Deno.test
  isEqual = assertEquals
}

export function suite(meta: ImportMeta, define: DefineSuite) {
  if (isBun)
    return define({
      test: global.Bun.jest(meta.path).test,
      isEqual
    })
  return define({isEqual, test})
}
