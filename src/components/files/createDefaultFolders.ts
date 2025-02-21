// Creates (and populates if appropriate) the folders that are not saved as part
// of git repo. We run this for safety when starting the server, or before
// saving or loading a snapshot.

import {
  PREFERENCES_FOLDER,
  PREFERENCES_FILE_NAME,
  LOCALISATION_FOLDER,
  FILES_FOLDER,
  SNAPSHOT_FOLDER,
  BACKUPS_FOLDER,
  BASE_SNAPSHOT_FOLDER,
  GENERIC_THUMBNAILS_FOLDER,
  GENERIC_THUMBNAILS_SOURCE_FOLDER,
  DATABASE_FOLDER,
  BASE_SNAPSHOT_NAME,
  TEST_SCRIPT_FOLDER,
  SNAPSHOT_ARCHIVE_FOLDER,
} from '../../constants'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { makeFolder } from '../utilityFunctions'
import { zipSnapshot } from '../snapshots/takeSnapshot'

export function createDefaultDataFolders() {
  try {
    makeFolder(SNAPSHOT_FOLDER, 'Creating SNAPSHOTS folder')
    makeFolder(SNAPSHOT_ARCHIVE_FOLDER)
    makeFolder(BACKUPS_FOLDER, 'Creating BACKUPS folder')
    // Copy core_templates to snapshots folder
    execSync(`cp -r '${DATABASE_FOLDER}/${BASE_SNAPSHOT_NAME}' '${SNAPSHOT_FOLDER}'`)
    // Make sure there is a zipped copy of core_templates too
    if (!fs.existsSync(path.join(SNAPSHOT_FOLDER, `${BASE_SNAPSHOT_NAME}.zip`)))
      zipSnapshot(path.join(SNAPSHOT_FOLDER, BASE_SNAPSHOT_NAME), BASE_SNAPSHOT_NAME)
  } catch {
    console.log('\nProblem creating SNAPSHOTS folder\n')
  }

  try {
    makeFolder(TEST_SCRIPT_FOLDER, 'Creating Test Script folder')
  } catch {
    console.log('\nProblem creating Test Scripts folder\n')
  }

  try {
    if (!fs.existsSync(FILES_FOLDER)) {
      makeFolder(FILES_FOLDER, 'Creating FILES folder')
      execSync(`cp -r '${BASE_SNAPSHOT_FOLDER}/files/.' '${FILES_FOLDER}'`)
    }
    // Restore generic thumbnails, they get wiped out during snapshot loading
    makeFolder(path.join(GENERIC_THUMBNAILS_FOLDER))
    execSync(`cp -r '${GENERIC_THUMBNAILS_SOURCE_FOLDER}/.' '${GENERIC_THUMBNAILS_FOLDER}'`)
  } catch {
    console.log('\nProblem creating FILES folder\n')
  }

  // If localisation folder is missing, we assume it's a fresh install and
  // fetch them (and preferences) from core templates
  try {
    if (
      !fs.existsSync(LOCALISATION_FOLDER) ||
      !fs.existsSync(path.join(LOCALISATION_FOLDER, 'languages.json'))
    ) {
      makeFolder(LOCALISATION_FOLDER, 'Restoring LOCALISATIONS and PREFERENCES')
      execSync(`cp -r '${BASE_SNAPSHOT_FOLDER}/localisation/.' '${LOCALISATION_FOLDER}'`)
      execSync(`cp '${BASE_SNAPSHOT_FOLDER}/${PREFERENCES_FILE_NAME}' '${PREFERENCES_FOLDER}'`)
    }
  } catch {
    console.log('\nProblem restoring LOCALISATIONS or PREFS\n')
  }
}
