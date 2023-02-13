import {build} from 'esbuild'
import glob from 'glob'

const entryPoints = process.env.PROFILE ? '{src,test}/**/*.ts' : 'src/**/*.ts'
const outdir = process.env.PROFILE ? 'bin' : 'dist'
await build({
  format: 'esm',
  target: 'esnext',
  entryPoints: glob.sync(entryPoints),
  outdir,
  bundle: true,
  plugins: [
    {
      name: 'add-js',
      setup(build) {
        build.onResolve({filter: /.*/}, args => {
          const path = args.path.endsWith('.ts')
            ? args.path.slice(0, -3) + '.js'
            : args.path
          if (args.importer) return {path, external: true}
        })
      }
    }
  ]
})
