import { spawn } from 'child_process'

// Parse env file string (of the form KEY='some-value') into object
// {key: "some-value"}
export const parseEnv = (input: string) => {
  const output: Record<string, string> = {}
  const lines = input.split('\n')
  lines.forEach((line) => {
    const match = /^([A-Z_0-9]+)=(?:'|")?(.+?)(?:'|")?$/g.exec(line)
    if (match) {
      output[match[1]] = match[2]
    }
  })
  return output
}

// Allows us to launch a child process that:
// - causes main function to wait for completion
// - prints real-time console/stdout output as it happens, without modification
//   (i.e. colours and in-line updating works)
// This is necessary for the docker-compose calls which can take significant
//   time to run, which is annoying without appropriate feedback
export async function spawnChild(cmd: string, args: string[]) {
  let child = spawn(cmd, args, { stdio: 'inherit' })
  return new Promise((resolve) => {
    child.on('exit', (code) => {
      resolve(code)
    })
  })
}
