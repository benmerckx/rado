import {build} from 'esbuild'
import glob from 'glob'

const entryPoints = process.env.PROFILE ? '{src,test}/**/*.ts' : 'src/**/*.ts'
const outdir = process.env.PROFILE ? 'bin' : 'dist'
await build({
  format: 'esm',
  target: 'esnext',
  entryPoints: glob.sync(entryPoints),
  outdir
})
