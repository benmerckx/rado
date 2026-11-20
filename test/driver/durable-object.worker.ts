import * as assert from 'node:assert'
import {DurableObject} from 'cloudflare:workers'
import {connect} from '#/driver/durable-object.ts'
import {testDriver} from '../TestDriver.ts'

interface Env {
  TEST: DurableObjectNamespace<TestObject>
}

type Run = () => unknown

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

// Collects the shared driver tests so they run inside the Durable Object
function collect(tests: Array<[string, Run]>): any {
  const define = (name: string, ...args: Array<any>) =>
    tests.push([name, args.at(-1)])
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
    const tests: Array<[string, Run]> = []
    testDriver(connect(this.ctx.storage), collect(tests), 'durable-object')
    const results = []
    for (const [name, run] of tests) {
      try {
        await run()
        results.push({name})
      } catch (error) {
        results.push({name, error: String((error as Error).stack ?? error)})
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
