import {parse} from 'uvu/parse'
import {run} from 'uvu/run'

parse('test', 'Test*').then(({suites}) => run(suites))
