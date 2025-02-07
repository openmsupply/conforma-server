import { writeToBuffer } from 'fast-csv'
import { LookupTableService } from '../services'
import { errorMessage } from '../../components/utilityFunctions'

const ExportCsv = async (request: any, reply: any) => {
  const tableId = Number(request.params.lookupTableId)

  const lookupTableService = await LookupTableService({ tableId, dataViewCode: 'ignore' })
  try {
    const tableData = await lookupTableService.getAllRowsForTable()

    var csvStream = await writeToBuffer(tableData, {
      headers: true,
    })

    reply
      .header('Content-disposition', 'attachment; filename=myFile.csv')
      .header('content-type', 'text/csv')
      .send(csvStream)
  } catch (error) {
    reply
      .status(422)
      .send({ status: 'error', name: errorMessage(error, 'name'), message: errorMessage(error) })
  }
}

export default ExportCsv
