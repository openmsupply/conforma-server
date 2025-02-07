import { FastifyRequest, FastifyReply } from 'fastify'
import { parseStream } from 'fast-csv'
import { LookupTableService } from '../services'

interface ImportCsvUpdateRequest {
  Params: { lookupTableId: string }
  Querystring: { name: string; code: string }
}

const ImportCsvUpdateController = async (
  request: FastifyRequest<ImportCsvUpdateRequest>,
  reply: FastifyReply
) => {
  const { lookupTableId } = request.params
  const { name, code } = request.query
  const data = await request.files()

  const lookupTableService = await LookupTableService({
    tableId: Number(lookupTableId),
    name,
    dataViewCode: code,
  })

  for await (const file of data) {
    await new Promise((resolve, reject) => {
      parseStream(file.file, {
        headers: lookupTableService.parseCsvHeaders,
      })
        .on('data', async (row) => {
          await lookupTableService.addRow(row)
        })
        .on('end', async () => {
          await lookupTableService
            .updateTable()
            .catch((error: Error) =>
              reject(
                reply
                  .status(422)
                  .send({ status: 'error', name: error.name, message: error.message })
              )
            )
            .then((message) => {
              resolve(reply.send({ status: 'success', message: JSON.stringify(message) }))
            })
        })
        .on('error', (error: Error) => {
          reject(
            reply.status(422).send({ status: 'error', name: error.name, message: error.message })
          )
        })
    })
  }
}

export default ImportCsvUpdateController
