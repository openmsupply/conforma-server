import { FastifyRequest, FastifyReply } from 'fastify'
import { parseStream } from 'fast-csv'
import { LookupTableService } from '../services'

const ImportCsvController = async (
  request: FastifyRequest<{ Querystring: { name: string; code: string } }>,
  reply: FastifyReply
) => {
  const data = await request.files()
  const { name, code } = request.query

  const lookupTableService = await LookupTableService({ name, dataViewCode: code })

  for await (const file of data) {
    await new Promise((resolve, reject) => {
      parseStream(file.file, {
        headers: lookupTableService.parseCsvHeaders,
      })
        .on('data', function (row) {
          lookupTableService.addRow(row)
        })
        .on('end', async () => {
          await lookupTableService
            .createTable()
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
        .on('error', (error) => {
          reject(
            reply.status(422).send({ status: 'error', name: error.name, message: error.message })
          )
        })
    })
  }
}

export default ImportCsvController
