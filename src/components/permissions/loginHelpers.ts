import databaseConnect from '../database/databaseConnect'
import config from '../../config'
import { verify, sign } from 'jsonwebtoken'
import { promisify } from 'util'
import { nanoid } from 'nanoid'
import { PermissionRow, TemplatePermissions } from './types'
import { baseJWT, compileJWT } from './rowLevelPolicyHelpers'
import { Organisation, UserOrg } from '../../types'
import { errorMessage } from '../utilityFunctions'
import { DEFAULT_LOGOUT_TIME } from '../../constants'

const verifyPromise: any = promisify(verify)
const signPromise: any = promisify(sign)

const extractJWTfromHeader = (request: any) =>
  (request?.headers?.authorization || '').replace('Bearer ', '')

const getTokenData = async (jwtToken: string) => {
  try {
    const data = await verifyPromise(jwtToken, config.jwtSecret)
    return data
  } catch (err) {
    console.log('Cannot parse JWT')
    return { error: errorMessage(err) }
  }
}

type UserOrgParameters = {
  username?: string
  userId?: number
  orgId?: number
  sessionId?: string
}

const getUserInfo = async (userOrgParameters: UserOrgParameters) => {
  const { username, userId, orgId, sessionId } = userOrgParameters

  const userOrgData: UserOrg[] = await databaseConnect.getUserOrgData({
    userId,
    username,
  })

  const {
    userId: newUserId,
    username: newUsername,
    firstName,
    lastName,
    email,
    dateOfBirth,
  } = userOrgData?.[0] as UserOrg

  const orgList: Organisation[] = userOrgData
    .filter((item) => item.orgId)
    .map(({ orgId, orgName, userRole, registration, address, logoUrl, isSystemOrg }) => {
      // Destructuring extracts only the relevant fields
      return { orgId, orgName, userRole, registration, address, logoUrl, isSystemOrg }
    })

  const templatePermissionRows = await databaseConnect.getUserTemplatePermissions(
    newUsername,
    orgId || null,
    true
  )

  // Also get org-only permissions
  if (orgId)
    templatePermissionRows.push(...(await databaseConnect.getOrgTemplatePermissions(orgId)))

  const selectedOrg = orgId ? orgList.filter((org) => org.orgId === orgId) : undefined

  const returnSessionId = sessionId ?? nanoid(16)

  const managementPrefName =
    config?.systemManagerPermissionName || config.defaultSystemManagerPermissionName

  const { isAdmin, isManager } = await databaseConnect.getUserAdminStatus(
    managementPrefName,
    newUserId,
    orgId ?? null
  )

  return {
    templatePermissions: buildTemplatePermissions(templatePermissionRows),
    JWT: await getSignedJWT({
      userId: userId || newUserId,
      username: username || newUsername,
      orgId,
      templatePermissionRows,
      sessionId: returnSessionId,
      isAdmin,
      isManager,
    }),
    user: {
      userId: userId || newUserId,
      username: username || newUsername,
      permissionNames: Array.from(
        new Set(templatePermissionRows.map(({ permissionName }) => permissionName))
      ),
      firstName,
      lastName,
      email,
      dateOfBirth,
      organisation: selectedOrg?.[0],
      sessionId: returnSessionId,
      isAdmin,
      isManager,
    },
    orgList,
    tokenExpiry:
      parseInt(String(Date.now() / 1000)) +
      (config.logoutAfterInactivity ?? DEFAULT_LOGOUT_TIME) * 60,
  }
}

const buildTemplatePermissions = (templatePermissionRows: Array<PermissionRow>) => {
  const templatePermissions: TemplatePermissions = {}

  templatePermissionRows.forEach(({ permissionType, templateCode }: PermissionRow) => {
    if (!templateCode || !permissionType) return
    if (!templatePermissions[templateCode]) templatePermissions[templateCode] = []
    if (templatePermissions[templateCode].includes(permissionType)) return
    templatePermissions[templateCode].push(permissionType)
  })

  return templatePermissions
}

const getSignedJWT = async (JWTelements: object) => {
  return await signPromise(compileJWT(JWTelements), config.jwtSecret)
}

const getAdminJWT = async () => {
  return await signPromise({ ...baseJWT, isAdmin: true, role: 'postgres' }, config.jwtSecret)
}

export { extractJWTfromHeader, getUserInfo, getTokenData, getAdminJWT }
