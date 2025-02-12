import fsx from 'fs-extra'
import { execSync } from 'child_process'

execSync(
  `yarn pg-to-ts generate -c postgresql://postgres@localhost:5432/tmf_app_manager -o ./src/generated/postgres.ts`
)
