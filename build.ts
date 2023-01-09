import {build} from 'esbuild'
import glob from 'glob'

await build({
  format: 'esm',
  target: 'esnext',
  entryPoints: glob.sync('src/**/*.ts'),
  outdir: 'dist',
  bundle: true,
  plugins: [
    {
      name: 'add-js',
      setup(build) {
        build.onResolve({filter: /.*/}, args => {
          if (args.importer) return {path: args.path + '.js', external: true}
        })
      }
    }
  ]
})
