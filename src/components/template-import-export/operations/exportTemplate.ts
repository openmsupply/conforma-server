import path from 'path'
import fsx from 'fs-extra'
import { ApiError } from '../../../ApiError'
import db from '../databaseMethods'
import { FILES_FOLDER, FILES_TEMP_FOLDER } from '../../../constants'
import { DateTime } from 'luxon'
import config from '../../../config'
import archiver from 'archiver'
import { buildTemplateStructure } from '../utilities'
import { PgTemplate } from '../types'

export const exportTemplate = async (templateId: number) => {
  console.log(`Exporting template: ${templateId}...`)
  const template = await db.getRecord<PgTemplate>('template', templateId)

  if (!template) throw new ApiError(`Template ${templateId} does not exist`, 400)

  if (template.version_id.startsWith('*'))
    throw new ApiError(`Template ${templateId} has not been committed`, 400)

  console.log('Building structure...')

  const templateStructure = await buildTemplateStructure(template)

  // Now dump the data to output files
  console.log('Outputting to disk...')
  const { code, version_id, version_history } = template
  const outputName = `${code}-${version_id}_v${((version_history as unknown[]) ?? []).length + 1}`
  const fullOutputPath = path.join(FILES_TEMP_FOLDER, outputName)

  await fsx.emptyDir(fullOutputPath)
  await fsx.writeJSON(path.join(fullOutputPath, 'template.json'), templateStructure, { spaces: 2 })
  await fsx.writeJSON(
    path.join(fullOutputPath, 'info.json'),
    { timestamp: DateTime.now().toISO(), version: config.version },
    { spaces: 2 }
  )

  const files = Object.values(templateStructure.shared.files).map(({ data }) => data)

  if (files.length > 0) {
    await fsx.mkdir(path.join(fullOutputPath, 'files'))
    for (const file of files) {
      const { file_path, archive_path } = file
      await fsx.copy(
        path.join(FILES_FOLDER, archive_path ?? '', file_path),
        path.join(fullOutputPath, 'files', file_path)
      )
    }
  }

  console.log('Zipping template...')
  const zipFilePath = path.join(FILES_FOLDER, `${outputName}.zip`)
  const output = await fsx.createWriteStream(zipFilePath)
  const archive = archiver('zip', { zlib: { level: 9 } })

  await archive.pipe(output)
  await archive.directory(fullOutputPath, false)
  await archive.finalize()

  await fsx.remove(fullOutputPath)
  console.log('Returning zip')
  config.scheduledJobs?.manuallySchedule('cleanup', 5)
  return `${outputName}.zip`
}
