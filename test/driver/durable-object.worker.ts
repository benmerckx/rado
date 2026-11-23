import * as assert from 'node:assert'
import {DurableObject} from 'cloudflare:workers'
import {connect} from '#/driver/durable-object.ts'
import {testDriver} from '../TestDriver.ts'

interface Env {
  TEST: DurableObjectNamespace<TestObject>
}

type Run = () => unknown

interface Test {
  name: string
  skip: boolean
  run: Run
}

function throws(run: Run, includes?: string): unknown {
  const fail = () => {
    throw new Error('Expected an error')
  }
  const check = (error: unknown) => {
    if (includes)
      assert.match(String((error as Error).message), RegExp(includes))
  }
  try {
    const result = run()
    if (result instanceof Promise) return result.then(fail, check)
  } catch (error) {
    return check(error)
  }
  fail()
}

// Durable Objects forbid temp tables and always enforce foreign keys, which
// makes push refuse to rebuild a table. Generate's default shadow needs the
// runtime's own sqlite
const unsupported = new Set([
  'generate round trip',
  'generate rebuild keeps referencing rows',
  'inspect reads indexes of a shadowed name',
  'multiple pushes',
  'push index modifications',
  'push refuses to narrow a type',
  'push refuses not null over nulls',
  'push fails adding a required column to rows'
])

// Collects the shared driver tests so they run inside the Durable Object
function collect(tests: Array<Test>): any {
  const define = (name: string, ...args: Array<any>) => {
    const skip = unsupported.has(name.slice('durable-object: '.length))
    tests.push({name, skip, run: args.at(-1)})
  }
  return Object.assign(define, {
    skip() {},
    only: define,
    ok: assert.ok,
    is: assert.strictEqual,
    equal: assert.deepStrictEqual,
    throws,
    not: {
      ok: (value: unknown) => assert.ok(!value),
      is: assert.notStrictEqual,
      equal: assert.notDeepStrictEqual
    }
  })
}

export class TestObject extends DurableObject<Env> {
  async fetch(): Promise<Response> {
    const tests: Array<Test> = []
    testDriver(connect(this.ctx.storage), collect(tests), 'durable-object')
    const results = []
    for (const {name, skip, run} of tests) {
      try {
        if (!skip) await run()
        results.push({name, skip})
      } catch (error) {
        results.push({
          name,
          skip,
          error: String((error as Error).stack ?? error)
        })
      }
    }
    return Response.json(results)
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return env.TEST.get(env.TEST.idFromName('test')).fetch(request)
  }
}
