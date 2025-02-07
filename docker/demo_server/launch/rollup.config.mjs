import typescript from '@rollup/plugin-typescript'
import sizes from 'rollup-plugin-sizes'
import terser from '@rollup/plugin-terser'
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
      terser({
        module: true,
        format: {
          preamble: `/**
 * Updated ${new Date().toLocaleDateString()}
 *
 * CONFORMA/DOCKER LAUNCH SCRIPT
 *
 * This script can be compiled and placed on a server (or locally) and used to
 * launch Conforma Docker containers using configuration options specified in
 * either:
 * - environment variables
 * - a site-specific "env" file (place in /env_files/<site>.env)
 * - a common "default.env" file (in the same location as the launch script)
 *
 * See env_files/example.env and default.env in this folder for examples
 *
 * Launch the script with "node launch.mjs <site1> <site2> ..."
 *
 * Will prompt for a single site if site args are omitted.
 *
 * To create a global alias (that can be run from anywhere), add the following
 * line to the host shell configuration file (probably ~/.zshrc or ~/.bashrc):
 *
 * alias launch_conforma="node /path/to/script_folder/launch.mjs"
 */
`,
        },
      }),
      sizes(),
    ],
  },
  {
    input: 'src/stop.ts',
    output: [
      {
        file: '../stop.mjs',
        format: 'esm',
      },
    ],
    plugins: [
      typescript(),
      resolve({ preferBuiltins: true, exportConditions: ['node'] }),
      commonjs(),
      terser({
        module: true,
        format: {
          preamble: `/**
 * Updated ${new Date().toLocaleDateString()}
 *
 * CONFORMA/DOCKER STOP SCRIPT
 * 
 * Stop Conforma Docker instance.
 * 
 * See launch.mjs for command line usage
 *
 * To create a global alias (that can be run from anywhere), add the following
 * line to the host shell configuration file (probably ~/.zshrc or ~/.bashrc):
 *
 * alias stop_conforma="node /path/to/script_folder/stop.mjs"
 */
`,
        },
      }),
      sizes(),
    ],
  },
]
