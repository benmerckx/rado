import {type Plugin, build} from 'esbuild'
import {glob} from 'glob'
import {readFileSync, writeFileSync} from 'node:fs'

const entryPoints = process.env.PROFILE ? '{src,test}/**/*.ts' : 'src/**/*.ts'
const outdir = process.env.PROFILE ? 'bin' : 'dist'
const outExt: Plugin = {
  name: 'out-ext',
  setup(build) {
    build.onResolve({filter: /.*/}, ({kind, path}) => {
      if (kind === 'entry-point') return
      if (path.endsWith('.ts'))
        return {external: true, path: `${path.slice(0, -3)}.js`}
      return {external: true, path}
    })
    build.onEnd(() => {
      for (const file of glob.sync(`${outdir}/**/*.d.ts`)) {
        writeFileSync(
          file,
          readFileSync(file, 'utf8').replace(/\.ts'/g, ".js'")
        )
      }
    })
  }
}
await build({
  format: 'esm',
  target: 'esnext',
  entryPoints: glob.sync(entryPoints),
  outdir,
  bundle: true,
  plugins: [outExt]
}).catch(() => process.exit(1))
