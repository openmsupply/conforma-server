/**
 * Generates SHA-256 hashes for database records. The `hashRecord` operation is
 * called via a database trigger whenever template-relevant records are inserted
 * or updated, namely:
 *  - data_view
 *  - data_view_column_definition
 *  - data_table
 *  - template_category
 *  - filter
 *  - file
 *
 * Foreign key references are replaced by the actual data they refer to before
 * hashing
 */

import { DataTable as PgDataTable } from '../../../generated/postgres'
import fs from 'fs'
import { getLookupTableData } from '../../../lookup-table/export'
import db from '../databaseMethods'
import { createHash } from 'crypto'

interface NotificationPayload {
  tableName: string
  id: number
}

export const hashRecord = async ({ tableName, id }: NotificationPayload) => {
  const data = await db.getRecord<Record<string, unknown>>(tableName, id)
  const oldChecksum = data.checksum
  delete data.id
  delete data.checksum
  delete data.last_modified

  // Remove foreign_key ids and replace with the actual data they refer to
  if (tableName === 'permission_name') {
    await replaceForeignKeyRef(
      data,
      'permission_policy',
      'permission_policy_id',
      'permission_policy'
    )
  }

  // For file table, we just ignore foreign key references, as they shouldn't be
  // relevant to template import/export, which is what the purpose of this is
  if (tableName === 'file') {
    ;['user_id', 'application_response_id', 'application_note_id', 'application_serial'].forEach(
      (column) => {
        delete data[column]
      }
    )
  }

  const checksum = getHash(data)

  if (checksum !== oldChecksum) {
    // Don't update if checksum hasn't changed, otherwise gets into infinite
    // loop
    console.log(`Updating checksum for Record ${id} on ${tableName}`)
    await db.updateChecksum(tableName, id, checksum)
  }
}

// Creates a hash for an entire lookup table by taking the hash of all the
// individual record hashes
export const hashLookupTable = async (tableId: number) => {
  try {
    const dataTableRecord = await db.getRecord<Partial<PgDataTable>>('data_table', tableId)
    delete dataTableRecord.checksum
    delete dataTableRecord.last_modified
    const recordHashes = [getHash(dataTableRecord)]

    const tableData = await getLookupTableData(tableId)
    tableData.forEach((row) => recordHashes.push(getHash(row)))
    const fullTableHash = getHash(recordHashes)
    await db.updateChecksum('data_table', tableId, fullTableHash)
  } catch (err) {
    console.log(`ERROR calculating hash for lookup table ${tableId}: ${(err as Error).message}`)
  }
}

export const getHash = (data: unknown) => {
  const hash = createHash('sha256')
  hash.update(JSON.stringify(data))
  return hash.digest('hex')
}

// Hash a file -- this is checked on template import to ensure that an imported
// file that already exists hasn't been changed since the template export
export const hashFile = (filePath: string) =>
  new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const rs = fs.createReadStream(filePath)
    rs.on('error', reject)
    rs.on('data', (chunk) => hash.update(chunk))
    rs.on('end', () => resolve(hash.digest('hex')))
  })

// Takes a record that has foreign key references and replaces the foreign key
// id with the actual data referenced. Modifies data object in place.
export const replaceForeignKeyRef = async (
  data: Record<string, unknown>,
  foreignTable: string,
  foreignKeyField: string,
  replacementField: string
) => {
  const foreignKeyId = data[foreignKeyField] as number
  delete data[foreignKeyField]
  const replacementData =
    (await db.getRecord<Record<string, unknown>>(foreignTable, foreignKeyId)) ?? null
  if (replacementData !== null) delete replacementData.id
  data[replacementField] = replacementData
  // No need to return, since original object is mutated directly
}
