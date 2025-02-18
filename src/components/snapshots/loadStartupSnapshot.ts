/**
 * Mechanism to load a snapshot on startup. Mainly used for new Docker
 * instances so they launch with a specific snapshot.
 *
 * Snapshot name is provided in Environment vars, will skip if not specified.
 *
 * Will only run if the current system snapshot is the "default" one, as
 * specified in `insert_data.sh` (i.e. "core_templates"), to prevent initialised
 * systems being overwritten
 */

import DB from '../database/databaseConnect'
import useSnapshot from './useSnapshot'

const DEFAULT_SYSTEM_SNAPSHOT = 'core_templates'

export const loadStartupSnapshot = async () => {
  const currentSnapshot = await DB.getSystemInfo('snapshot')
  if (currentSnapshot !== DEFAULT_SYSTEM_SNAPSHOT) return

  const snapshotName = process.env.INITIALISE_SNAPSHOT
  if (!snapshotName) {
    console.log('No initial snapshot specified in Environment')
    return
  }

  await useSnapshot({ snapshotName })
}
