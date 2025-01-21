export type DatabaseColumn = {
  columnName: string
  isPrimary: boolean
  isUnique: boolean
  isNullable: boolean
  isGenerated: boolean
  isReference: boolean
  isEnum: boolean
  isEnumArray: boolean
  isJson: boolean
  isJsonArray: boolean
  reference: {
    tableName: string
    columnName: string
  }
}

export type DatabaseTable = {
  tableName: string
  isView: boolean
  referenceTables: string[]
  columns: DatabaseColumn[]
}

export type DatabaseTables = DatabaseTable[]

export type ExportAndImportOptions = {
  excludeTables: string[]
  shouldReInitialise: boolean
  skipZip?: boolean
  includeLocalisation?: boolean
  includePrefs?: boolean
  resetFiles: boolean
  archive?: ArchiveOption
}

export type ArchiveInfo = { type: 'full' | 'none' | 'partial'; from?: string; to?: string } | null
export interface SnapshotInfo {
  timestamp: string
  version: string
  archive?: ArchiveInfo
}

export type SnapshotType = 'normal' | 'archive' | 'backup'

export type SnapshotOperation = (props: {
  snapshotName: string
  snapshotType?: SnapshotType
  archive?: ArchiveOption
}) => Promise<{ success: boolean; message: string; error?: string; snapshot?: string }>

export type ArchiveSnapshotOperation = (props: {
  snapshotName?: string
  archiveOption?: ArchiveOption
}) => Promise<{ success: boolean; message: string; error?: string }>

export type ArchiveOption =
  | 'none'
  | 'full'
  | string
  | number
  | { from: string | number; to: string | number }
