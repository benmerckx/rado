import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {connect} from './DbSuite'

test('Test raw sql', async () => {
  const query = await connect()
  assert.is(await query`select 1 as res`, [{res: 1}])
})

test.run()
