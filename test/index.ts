import {parse} from 'uvu/parse'
import {run} from 'uvu/run'

const pattern = process.argv[2]

parse('test', 'Test*').then(({suites}) =>
  run(
    suites.filter(({name}) =>
      pattern ? name.toLowerCase().includes(pattern) : true
    )
  )
)
