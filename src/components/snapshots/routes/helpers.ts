import fs from 'fs/promises'
import fsSync from 'fs'
import fse from 'fs-extra'
import {
  INFO_FILE_NAME,
  SNAPSHOT_ARCHIVES_FOLDER_NAME,
  SNAPSHOT_FILE_NAME,
  SNAPSHOT_FOLDER,
} from '../../../constants'
import path from 'path'
import { SnapshotInfo } from '../../exportAndImport/types'

export const getSnapshotList = async () => {
  const dirents = await fs.readdir(SNAPSHOT_FOLDER, { encoding: 'utf-8', withFileTypes: true })
  const snapshots: (SnapshotInfo & { name: string })[] = []

  for (const dirent of dirents) {
    if (!dirent.isDirectory()) continue
    if (
      !(
        fsSync.existsSync(path.join(SNAPSHOT_FOLDER, dirent.name, `${SNAPSHOT_FILE_NAME}.json`)) ||
        fsSync.existsSync(path.join(SNAPSHOT_FOLDER, dirent.name, `database.dump`))
      )
    )
      continue

    const info = await fse.readJson(
      path.join(SNAPSHOT_FOLDER, dirent.name, `${INFO_FILE_NAME}.json`)
    )

    snapshots.push({ name: dirent.name, ...info })
  }

  return { snapshotsNames: snapshots }
}

export const getSnapshotArchiveList = async () => {
  const archiveSnapshotFolder = path.join(SNAPSHOT_FOLDER, SNAPSHOT_ARCHIVES_FOLDER_NAME)
  const dirents = await fs.readdir(archiveSnapshotFolder, {
    encoding: 'utf-8',
    withFileTypes: true,
  })
  const snapshots: (SnapshotInfo & { name: string })[] = []

  for (const dirent of dirents) {
    if (!dirent.isDirectory()) continue
    if (!fsSync.existsSync(path.join(archiveSnapshotFolder, dirent.name, `${INFO_FILE_NAME}.json`)))
      continue

    const info = await fse.readJson(
      path.join(archiveSnapshotFolder, dirent.name, `${INFO_FILE_NAME}.json`)
    )

    snapshots.push({ name: dirent.name, ...info })
  }

  return { snapshotsNames: snapshots }
}
