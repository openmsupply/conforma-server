import PostgresDB from './postgresConnect'
import GraphQLdb from './graphQLConnect'

class DBConnect {
  private static _instance: DBConnect

  constructor() {}

  public static get Instance() {
    return this._instance || (this._instance = new this())
  }

  public query = PostgresDB.query

  public end = PostgresDB.end

  public getValuesPlaceholders = PostgresDB.getValuesPlaceholders

  public getCounter = PostgresDB.getCounter

  public addActionQueue = PostgresDB.addActionQueue

  public executedActionStatusUpdate = PostgresDB.executedActionStatusUpdate

  public getActionsProcessing = PostgresDB.getActionsProcessing

  public updateActionParametersEvaluated = PostgresDB.updateActionParametersEvaluated

  public triggerScheduledActions = PostgresDB.triggerScheduledActions

  public resetTrigger = PostgresDB.resetTrigger

  public setScheduledActionDone = PostgresDB.setScheduledActionDone

  public addFile = PostgresDB.addFile

  public getFileDownloadInfo = PostgresDB.getFileDownloadInfo

  public addActionPlugin = PostgresDB.addActionPlugin

  public deleteActionPlugin = PostgresDB.deleteActionPlugin

  public getActionPlugins = PostgresDB.getActionPlugins

  public getActionsByTemplateId = PostgresDB.getActionsByTemplateId

  public updateActionPlugin = PostgresDB.updateActionPlugin

  public updateTriggerQueueStatus = PostgresDB.updateTriggerQueueStatus

  public getVerification = PostgresDB.getVerification

  public setVerification = PostgresDB.setVerification

  public addUserOrg = PostgresDB.addUserOrg

  public isUnique = PostgresDB.isUnique

  public setApplicationOutcome = PostgresDB.setApplicationOutcome

  public getApplicationData = PostgresDB.getApplicationData

  public getApplicationIdFromTrigger = PostgresDB.getApplicationIdFromTrigger

  public getTemplateIdFromTrigger = async (
    tableName: string,
    record_id: number
  ): Promise<number> => {
    let templateId: number
    switch (tableName) {
      case 'application':
      case 'review':
      case 'review_assignment':
      case 'verification':
      case 'trigger_schedule':
        templateId = await PostgresDB.getTemplateIdFromTrigger(tableName, record_id)
        break
      // TO-DO: Implement these queries once we have more data in database
      // -- will probably be easier using GraphQL
      case 'review_response':
      case 'review_section':
      case 'review_section_assign':
      default:
        throw new Error('Table name not valid')
    }
    return templateId
  }

  public getTemplateStages = PostgresDB.getTemplateStages

  public getCurrentStageStatusHistory = PostgresDB.getCurrentStageStatusHistory

  public getNextStage = PostgresDB.getNextStage

  public addNewStageHistory = PostgresDB.addNewStageHistory

  public getReviewCurrentStatusHistory = PostgresDB.getReviewCurrentStatusHistory

  public addNewApplicationStatusHistory = PostgresDB.addNewApplicationStatusHistory

  public addNewReviewStatusHistory = PostgresDB.addNewReviewStatusHistory

  public getUserData = PostgresDB.getUserData

  public getUserOrgData = PostgresDB.getUserOrgData

  public getApplicationResponses = PostgresDB.getApplicationResponses

  public getUserTemplatePermissions = PostgresDB.getUserTemplatePermissions

  public getAllPermissions = PostgresDB.getAllPermissions

  public getAllGeneratedRowPolicies = PostgresDB.getAllGeneratedRowPolicies

  public getUserPermissionNames = PostgresDB.getUserPermissionNames

  public joinPermissionNameToUser = PostgresDB.joinPermissionNameToUser

  public joinPermissionNameToUserOrg = PostgresDB.joinPermissionNameToUserOrg

  public getNumReviewLevels = PostgresDB.getNumReviewLevels

  public getReviewStageAndLevel = PostgresDB.getReviewStageAndLevel

  public isFullyAssignedLevel1 = PostgresDB.isFullyAssignedLevel1

  public getAllApplicationResponses = PostgresDB.getAllApplicationResponses

  public getAllReviewResponses = PostgresDB.getAllReviewResponses

  public getDatabaseInfo = PostgresDB.getDatabaseInfo

  // GraphQL

  public gqlQuery = GraphQLdb.gqlQuery

  public getReviewData = GraphQLdb.getReviewData
}

const dbConnectInstance = DBConnect.Instance

export type DBConnectType = typeof DBConnect.Instance
export default dbConnectInstance
