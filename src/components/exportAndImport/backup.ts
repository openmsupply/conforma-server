import takeSnapshot from '../snapshots/takeSnapshot'
import archiver from 'archiver'
// @ts-ignore -- no type declarations
import archiverZipEncrypted from 'archiver-zip-encrypted'
import { DateTime } from 'luxon'
import fs from 'fs'
import fsx from 'fs-extra'
import path from 'path'
import config from '../../config'
import {
  SNAPSHOT_FOLDER,
  BACKUPS_FOLDER,
  SNAPSHOT_ARCHIVES_FOLDER_NAME,
  FILES_FOLDER,
  ARCHIVE_SUBFOLDER_NAME,
} from '../../constants'
import { execSync } from 'child_process'
import { ArchiveData, ArchiveInfo } from '../files/archive'

interface ArchiveBackupInfo {
  uid: string
  archiveSnapshot: string
}
interface BackupInfo {
  latestBackup: string | null
  archives: ArchiveBackupInfo[]
}

archiver.registerFormat('zip-encrypted', archiverZipEncrypted)

const { backupFilePrefix = 'conforma_backup', maxBackupDurationDays } = config

const isManualBackup: Boolean = process.argv[2] === '--backup'
const passwordArg: string | undefined = process.argv[3]

const createBackup = async (password?: string) => {
  // Take snapshot
  const snapshotName = backupFilePrefix
  await fsx.ensureDir(path.join(BACKUPS_FOLDER, SNAPSHOT_ARCHIVES_FOLDER_NAME))
  execSync(`chmod -R 777 ${BACKUPS_FOLDER}/${SNAPSHOT_ARCHIVES_FOLDER_NAME}`)

  console.log(
    DateTime.now().toLocaleString(DateTime.DATETIME_SHORT_WITH_SECONDS),
    `Creating system backup: ${snapshotName}`
  )

  if (!password) console.log('WARNING: Backup is not encrypted')

  let backupInfo: BackupInfo
  try {
    backupInfo = await fsx.readJSON(path.join(BACKUPS_FOLDER, 'backup.json'), { throws: false })
  } catch {
    backupInfo = { latestBackup: null, archives: [] }
  }

  // Get ids of all existing archive backups (and confirm snapshots still exist)
  const existingArchiveBackupIds = await getArchiveBackups(backupInfo)

  // Get ids of all current system archives
  let currentSystemArchives: ArchiveInfo[]
  try {
    const archiveInfo: ArchiveData = await fsx.readJSON(
      path.join(FILES_FOLDER, ARCHIVE_SUBFOLDER_NAME, 'archive.json')
    )
    currentSystemArchives = archiveInfo.history
  } catch {
    currentSystemArchives = []
  }

  // Compare them and collect all missing
  const archivesNotBackedUp = currentSystemArchives.filter(
    (archive) => !existingArchiveBackupIds.includes(archive.uid)
  )

  const zipSources: string[] = []

  // Make new archive snapshot with missing archives
  if (archivesNotBackedUp.length > 0) {
    const archiveFrom = Math.min(...archivesNotBackedUp.map((a) => a.timestamp))
    const archiveTo = Math.max(...archivesNotBackedUp.map((a) => a.timestamp))

    const { snapshot: archiveSnapshot, error } = await takeSnapshot({
      snapshotName: `archive_${snapshotName}`,
      snapshotType: 'backup',
      archive: { from: archiveFrom, to: archiveTo },
      // TO-DO: Figure this out
      // isArchiveSnapshot: true,
    })

    if (!archiveSnapshot || error) {
      console.log('ERROR CREATING BACKUP: ' + error)
      return
    }

    zipSources.push(path.join(SNAPSHOT_ARCHIVES_FOLDER_NAME, archiveSnapshot))

    const archiveInfo = await fsx.readJSON(
      path.join(SNAPSHOT_FOLDER, SNAPSHOT_ARCHIVES_FOLDER_NAME, archiveSnapshot, 'info.json')
    )

    backupInfo.archives.push(
      ...archivesNotBackedUp.map(({ uid }) => ({
        uid,
        archiveSnapshot,
        from: archiveInfo.archive.from,
        to: archiveInfo.archive.to,
      }))
    )
  } else console.log('No new archives to back up')

  // Make new snapshot with no archives
  const { snapshot, error } = await takeSnapshot({
    snapshotName,
    snapshotType: 'backup',
    archive: 'none',
  })

  if (!snapshot || error) {
    console.log('ERROR CREATING SNAPSHOT: ' + error)
    return
  }

  zipSources.push(snapshot)

  // Zip them using password (or unencrypted if no password)
  console.log('Zipping backups...')
  for (const source of zipSources) {
    const output = fs.createWriteStream(path.join(BACKUPS_FOLDER, `${source}.zip`))
    const archive = password
      ? archiver.create('zip-encrypted', {
          zlib: { level: 9 },
          encryptionMethod: 'aes256',
          password,
        } as any)
      : archiver('zip', { zlib: { level: 9 } })

    output.on('close', () => {
      fsx.remove(path.join(SNAPSHOT_FOLDER, source))
    })

    output.on('error', (err) => {
      console.log('Problem creating backup: ', err.message)
      fsx.remove(path.join(SNAPSHOT_FOLDER, source))
    })

    await archive.pipe(output)
    await archive.directory(path.join(SNAPSHOT_FOLDER, source), false)
    await archive.finalize()

    // Make it read-writeable by everyone (so Dropbox can sync it)
    execSync(`chmod 666 ${BACKUPS_FOLDER}/${source}.zip`)
  }
  console.log('Zipping backups...done')

  // Update backup.json
  backupInfo.latestBackup = snapshot
  await fsx.writeJSON(path.join(BACKUPS_FOLDER, 'backup.json'), backupInfo, { spaces: 2 })
  execSync(`chmod 666 ${BACKUPS_FOLDER}/backup.json`)

  await cleanUpBackups()

  console.log(
    DateTime.now().toLocaleString(DateTime.DATETIME_SHORT_WITH_SECONDS),
    `Backup complete!`
  )

  if (isManualBackup) setTimeout(() => process.exit(0), 2000)
}

// For running backup manually using `yarn backup`
if (isManualBackup) {
  createBackup(passwordArg)
}

const cleanUpBackups = async () => {
  const maxDaysToKeep = maxBackupDurationDays
  if (!maxDaysToKeep) return

  console.log(`Removing backups older than ${maxDaysToKeep} days`)
  const backups = await fs.promises.readdir(BACKUPS_FOLDER)

  let deletedCount = 0

  for (const backup of backups) {
    if (path.extname(backup) !== '.zip') continue

    const backupCreatedTime = await (
      await fs.promises.stat(path.join(BACKUPS_FOLDER, backup))
    ).ctime
    const backupAgeInDays = DateTime.now().diff(DateTime.fromJSDate(backupCreatedTime)).as('days')
    if (backupAgeInDays > maxDaysToKeep) {
      await fs.promises.unlink(path.join(BACKUPS_FOLDER, backup))
      deletedCount++
    }
  }

  console.log(` - ${deletedCount} backup(s) deleted`)
}

export default createBackup

const getArchiveBackups = async (backupInfo: BackupInfo) => {
  const existingArchiveIds: string[] = []
  const toRemove: string[] = []
  for (const archive of backupInfo.archives) {
    if (
      await fsx.pathExists(
        path.join(BACKUPS_FOLDER, SNAPSHOT_ARCHIVES_FOLDER_NAME, `${archive.archiveSnapshot}.zip`)
      )
    )
      existingArchiveIds.push(archive.uid)
    else toRemove.push(archive.uid)
  }
  backupInfo.archives = backupInfo.archives.filter((a) => !toRemove.includes(a.uid))

  return existingArchiveIds
}
