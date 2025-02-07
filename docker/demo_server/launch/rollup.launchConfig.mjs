import typescript from '@rollup/plugin-typescript'
import commonjs from '@rollup/plugin-commonjs'
import resolve from '@rollup/plugin-node-resolve'

export default [
  {
    input: 'src/launch.ts',
    output: [
      {
        file: '../launch.mjs',
        format: 'esm',
      },
    ],
    plugins: [
      typescript(),
      resolve({ preferBuiltins: true, exportConditions: ['node'] }),
      commonjs(),
    ],
  },
]
