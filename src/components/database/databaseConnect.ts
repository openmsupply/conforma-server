import PostgresDB from './postgresConnect'
import GraphQLdb from './graphQLConnect'

class DBConnect {
  private static _instance: DBConnect

  constructor() {}

  public static get Instance() {
    return this._instance || (this._instance = new this())
  }

  public tableJsonColumns = PostgresDB.tableJsonColumns

  public isJsonColumn = PostgresDB.isJsonColumn

  public query = PostgresDB.query

  public end = PostgresDB.end

  public getRecord = PostgresDB.getRecord

  public getRecordsByField = PostgresDB.getRecordsByField

  public getValuesPlaceholders = PostgresDB.getValuesPlaceholders

  public getCounter = PostgresDB.getCounter

  public addActionQueue = PostgresDB.addActionQueue

  public executedActionStatusUpdate = PostgresDB.executedActionStatusUpdate

  public getActionsProcessing = PostgresDB.getActionsProcessing

  public updateActionParametersEvaluated = PostgresDB.updateActionParametersEvaluated

  public getScheduledEvent = PostgresDB.getScheduledEvent

  public updateScheduledEventTime = PostgresDB.updateScheduledEventTime

  public triggerScheduledActions = PostgresDB.triggerScheduledActions

  public resetTrigger = PostgresDB.resetTrigger

  public addTriggerEvent = PostgresDB.addTriggerEvent

  public setScheduledActionDone = PostgresDB.setScheduledActionDone

  public addFile = PostgresDB.addFile

  public updateFileDescription = PostgresDB.updateFileDescription

  public getFileDownloadInfo = PostgresDB.getFileDownloadInfo

  public getFilePaths = GraphQLdb.getFilePaths

  public cleanUpFiles = PostgresDB.cleanUpFiles

  public deleteMissingFileRecords = PostgresDB.deleteMissingFileRecords

  public checkIfInFileTable = PostgresDB.checkIfInFileTable

  public getFilesToArchive = PostgresDB.getFilesToArchive

  public setFileArchived = PostgresDB.setFileArchived

  public addActionPlugin = PostgresDB.addActionPlugin

  public deleteActionPlugin = PostgresDB.deleteActionPlugin

  public getActionPlugins = PostgresDB.getActionPlugins

  public getActionsByTemplateId = PostgresDB.getActionsByTemplateId

  public getTemplateSerialPattern = PostgresDB.getTemplateSerialPattern

  public getSingleTemplateAction = PostgresDB.getSingleTemplateAction

  public updateActionPlugin = PostgresDB.updateActionPlugin

  public updateTriggerQueueStatus = PostgresDB.updateTriggerQueueStatus

  public getVerification = PostgresDB.getVerification

  public setVerification = PostgresDB.setVerification

  public addUserOrg = PostgresDB.addUserOrg

  public removeUserOrg = PostgresDB.removeUserOrg

  public deleteUserOrgPermissions = PostgresDB.deleteUserOrgPermissions

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

  public getOrgName = PostgresDB.getOrgName

  public getUserData = PostgresDB.getUserData

  public getUserOrgData = PostgresDB.getUserOrgData

  public getApplicationResponses = PostgresDB.getApplicationResponses

  public getUserTemplatePermissions = PostgresDB.getUserTemplatePermissions

  public getOrgTemplatePermissions = PostgresDB.getOrgTemplatePermissions

  public getAllPermissions = PostgresDB.getAllPermissions

  public getTemplatePermissions = PostgresDB.getTemplatePermissions

  public getUserAdminStatus = PostgresDB.getUserAdminStatus

  public getAllGeneratedRowPolicies = PostgresDB.getAllGeneratedRowPolicies

  public getUserOrgPermissionNames = PostgresDB.getUserOrgPermissionNames

  public getNumReviewLevels = PostgresDB.getNumReviewLevels

  public getReviewStageAndLevel = PostgresDB.getReviewStageAndLevel

  // public isFullyAssignedLevel1 = PostgresDB.isFullyAssignedLevel1

  public getAllApplicationResponses = PostgresDB.getAllApplicationResponses

  public getAllReviewResponses = PostgresDB.getAllReviewResponses

  public getDatabaseInfo = PostgresDB.getDatabaseInfo

  public getAllTableNames = PostgresDB.getAllTableNames

  public getDataTableColumns = PostgresDB.getDataTableColumns

  public getTemplateVersionIDs = PostgresDB.getTemplateVersionIDs

  public getPermissionPolicies = PostgresDB.getPermissionPolicies

  public getAllowedDataViews = PostgresDB.getAllowedDataViews

  public getDataViewColumnDefinitions = PostgresDB.getDataViewColumnDefinitions

  public getApplicationSections = PostgresDB.getApplicationSections

  public addToChangelog = PostgresDB.addToChangelog

  public getSystemInfo = PostgresDB.getSystemInfo

  public setSystemInfo = PostgresDB.setSystemInfo

  public waitForDatabaseValue = PostgresDB.waitForDatabaseValue

  // GraphQL

  public gqlQuery = GraphQLdb.gqlQuery

  public getReviewData = GraphQLdb.getReviewData

  public getReviewDataFromAssignment = GraphQLdb.getReviewDataFromAssignment

  public isInternalOrg = GraphQLdb.isInternalOrg

  public getAllApplicationTriggers = GraphQLdb.getAllApplicationTriggers

  public getTemplatePermissionsFromApplication = GraphQLdb.getTemplatePermissionsFromApplication

  public getApplicationFiles = GraphQLdb.getApplicationFiles

  public getReferenceDocs = GraphQLdb.getReferenceDocs
}

const dbConnectInstance = DBConnect.Instance

export type DBConnectType = typeof DBConnect.Instance
export default dbConnectInstance
