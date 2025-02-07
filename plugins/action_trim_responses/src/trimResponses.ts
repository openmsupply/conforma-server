import databaseMethods from './databaseMethods'
import { ActionPluginType } from '../../types'
import { ActionQueueStatus, Reviewability } from '../../../src/generated/graphql'
import { errorMessage } from '../../../src/components/utilityFunctions'
const isEqual = require('deep-equal')
interface Response {
  id: number
  code: string
  template_element_id?: number
  application_response_id?: number
  review_response_link_id?: number
  value: { [key: string]: any }
  comment?: string
  decision?: string
  time_updated: any
}

interface ResponsesById {
  [key: number]: Response[]
}

const trimResponses: ActionPluginType = async ({ parameters, applicationData, DBConnect }) => {
  const db = databaseMethods(DBConnect)

  const applicationId = parameters?.applicationId ?? applicationData?.applicationId
  const reviewId = parameters?.reviewId ?? applicationData?.reviewData?.reviewId

  console.log(`Trimming unchanged duplicated ${reviewId ? 'Review' : 'Application'} responses...`)

  try {
    // Get ALL responses associated with application OR review
    const responses = reviewId
      ? await DBConnect.getAllReviewResponses(reviewId)
      : await DBConnect.getAllApplicationResponses(applicationId)

    const reviewLevel = responses?.[0]?.level_number

    // Create object of indexed responses, with array of response
    // objects for each indexed id

    const groupByField = !reviewId
      ? 'template_element_id'
      : reviewLevel > 1
      ? 'review_response_link_id'
      : 'application_response_id'

    const responsesById = groupResponses(responses, groupByField)
    const responsesToDelete: number[] = []

    // Calculate review and application responses that should be deleted
    Object.values(responsesById).forEach((responseArray) => {
      const latestResponse = responseArray[responseArray.length - 1]
      const previousResponse =
        responseArray.length > 1 ? responseArray[responseArray.length - 2] : null
      if (
        (previousResponse !== null && isEqual(latestResponse.value, previousResponse?.value)) ||
        // Application Responses
        (latestResponse.value === null && latestResponse.reviewability !== Reviewability.Always) ||
        // Review responses
        latestResponse.value?.decision === null
      )
        responsesToDelete.push(latestResponse.id)
    })

    // For both application and reviewer level 1 we update latestResponses for template element
    // (note, trimmed responses won't be updated as they will not exist)

    // Don't need to re-group for application
    const groupedResponsesForUpdate = !reviewId
      ? responsesById
      : groupResponses(responses, 'template_element_id')

    const responsesToUpdate = Object.values(groupedResponsesForUpdate).map(
      (responseArray) => responseArray[responseArray.length - 1].id
    )

    type Response = {
      applicationResponseId: number
      templateElementId: number
    }
    // Run delete operation on all in toDelete array (new method)
    const deletedResponses = (
      reviewId
        ? await db.deleteReviewResponses(responsesToDelete)
        : await db.deleteApplicationResponses(responsesToDelete)
    ).sort((a: Response, b: Response) => a.applicationResponseId - b.applicationResponseId)

    // Update timestamp of remaining responses (based on review/application latest status change timestamp)
    const updatedResponses = (
      reviewId
        ? await db.updateReviewResponseSubmittedTimestamps(responsesToUpdate, reviewId)
        : await db.updateApplicationResponseSubmittedTimestamps(responsesToUpdate, applicationId)
    ).sort((a: Response, b: Response) => a.applicationResponseId - b.applicationResponseId)

    console.log(`Deleted ${reviewId ? 'review' : 'application'} responses: `, deletedResponses)
    console.log(`Updated ${reviewId ? 'review' : 'application'} responses: `, updatedResponses)

    return {
      status: ActionQueueStatus.Success,
      error_log: '',
      output: {
        deletedResponses,
        updatedResponses,
      },
    }
  } catch (error) {
    console.log(errorMessage(error))
    return {
      status: ActionQueueStatus.Fail,
      error_log: 'There was a problem trimming duplicated responses.',
    }
  }
}

type GroupField = 'template_element_id' | 'application_response_id' | 'review_response_link_id'

function groupResponses(responses: Response[], groupField: GroupField): ResponsesById {
  const responsesGrouped: ResponsesById = {}
  for (const response of responses) {
    const id = response[groupField]
    if (!id) continue
    if (groupField === 'application_response_id' || groupField === 'review_response_link_id')
      response.value = { comment: response.comment, decision: response.decision }
    if (!(id in responsesGrouped)) responsesGrouped[id] = [response]
    else responsesGrouped[id].push(response)
  }
  return responsesGrouped
}

export default trimResponses
