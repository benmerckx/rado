import {parse} from 'uvu/parse'
import {run} from 'uvu/run'

const pattern = process.argv.pop()

parse('test', 'Test*').then(({suites}) =>
  run(
    suites.filter(({name}) =>
      pattern ? name.toLowerCase().includes(pattern) : true
    )
  )
)
