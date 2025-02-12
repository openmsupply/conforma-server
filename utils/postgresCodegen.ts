/**
 * Uses pg-to-ts package to auto-generate Typescript types from database. But we
 * exclude all tables prefixed with `data_table_` as these are dynamically
 * generated and not part of the core schema.
 */

import { execSync } from 'child_process'
import { Client } from 'pg'
import config from './config.json'

const run = async () => {
  const db = new Client(config.postgresConfig)

  db.connect()

  console.log('Generating Postgres Types...')

  const result = await db.query({
    text: `SELECT table_name FROM information_schema.tables
                  WHERE table_name LIKE 'data_table_%'`,
    rowMode: 'array',
  })
  const tablesToExclude = result.rows.flat()
  const exclusionString = tablesToExclude.join(' ')

  execSync(
    `yarn pg-to-ts generate -c postgresql://postgres@localhost:5432/tmf_app_manager -o ./src/generated/postgres.ts -x ${exclusionString}`
  )

  db.end()
}

run().then(() => console.log('Done'))
