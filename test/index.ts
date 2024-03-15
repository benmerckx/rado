import sade from 'sade'
import {parse} from 'uvu/parse'
import {run} from 'uvu/run'

sade('test [pattern]', true)
  .option('--driver', 'Pick driver')
  .action((pattern, opts) => {
    process.env.TEST_DRIVER = opts.driver || 'better-sqlite3'
    parse('test', 'Test*')
      .then(({suites}) =>
        run(
          suites.filter(({name}) =>
            pattern
              ? name.toLowerCase().includes(pattern)
              : name.startsWith('Test')
          )
        )
      )
      .then(() => {
        process.exit(0)
      })
  })
  .parse(process.argv)
