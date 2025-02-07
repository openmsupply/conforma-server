import databaseConnect from '../database/databaseConnect'
import { getUserInfo } from './loginHelpers'
import { updateRowPolicies } from './rowLevelPolicyHelpers'
import bcrypt from 'bcrypt'
import { UserOrg } from '../../types'
import { PermissionDetails } from '../permissions/types'
import { startCase } from 'lodash'
import { errorMessage } from '../utilityFunctions'

const saltRounds = 10 // For bcrypt salting: 2^saltRounds = 1024

const routeCreateHash = async (request: any, reply: any) => {
  const { password } = request.body

  // bcrypt hash output includes salt and other metadata in string
  // See https://github.com/kelektiv/node.bcrypt.js#hash-info
  const hash = await bcrypt.hash(password, saltRounds)
  return reply.send({
    hash,
  })
}

/*
Authenticates login and returns:
  - userInfo
  - list of organisations belonging to user
  - template permissions
  - JWT containing permissions and userId
*/
const routeLogin = async (request: any, reply: any) => {
  try {
    const { username, password, sessionId } = request.body
    if (password === undefined) return reply.send({ success: false })

    const userOrgInfo: UserOrg[] = (await databaseConnect.getUserOrgData({ username })) || {}
    if (userOrgInfo.length === 0) return reply.send({ success: false })
    const { userId, passwordHash } = userOrgInfo?.[0]
    if (!userId) return reply.send({ success: false })

    if (!(await bcrypt.compare(password, passwordHash as string)))
      return reply.send({ success: false })

    // Login successful
    reply.send({
      success: true,
      ...(await getUserInfo({ userId, sessionId })),
    })
  } catch (err) {
    return reply.send({ success: false, error: errorMessage(err) })
  }
}

/*
Authenticates user and checks they belong to requested org (id). Returns:
  - userInfo (including orgId and orgName)
  - template permissions
  - JWT (with orgId included)
*/
const routeLoginOrg = async (request: any, reply: any) => {
  const { orgId, sessionId } = request.body

  const { userId, error } = request.auth
  if (error) return reply.send({ success: false, message: error })

  const userInfo = await getUserInfo({ userId, orgId, sessionId })

  reply.send({ success: true, ...userInfo })
}

/*
Authenticates user using JWT header and returns latest user/org info,
template permissions and new JWT token
*/
const routeUserInfo = async (request: any, reply: any) => {
  const { sessionId } = request.query
  const { userId, orgId, username, sessionId: returnSessionId, error } = request.auth

  if (error) return reply.send({ success: false, message: error })

  const userData = await getUserInfo({ userId, orgId, sessionId: sessionId ?? returnSessionId })

  // This check is to prevent a user remaining logged in as a different user if
  // the snapshot changes and their userId corresponds to a different username
  // on the new system. So we check that the username matches the one from the
  // JWT too, and return error if no match
  if (userData.user.username !== username)
    return reply.send({ success: false, message: 'Invalid username' })

  return reply.send({ success: true, ...userData })
}

const routeUserPermissions = async (request: any, reply: any) => {
  const { auth, query } = request
  if (!query || (!query.username && !query.orgId))
    return reply.send({
      success: false,
      message: 'Missing username or orgId in query.',
    })

  const username = query?.username === '' ? null : query?.username ?? null
  const orgId: number | null =
    query?.orgId === 'null' || query?.orgId === '0'
      ? null
      : query?.orgId
      ? Number(query.orgId)
      : null

  if (auth.error) return reply.send({ success: false, message: auth.console.error })

  const isSystemOrg = orgId ? await databaseConnect.isInternalOrg(orgId) : false

  const templatePermissionRows = await databaseConnect.getTemplatePermissions(isSystemOrg)

  let grantedPermissions: string[] = []
  let availablePermissions: string[] = []

  if (username) {
    // Get permissions for organisation and which have been granted to user
    const userExistingPermissions = await databaseConnect.getUserTemplatePermissions(
      username,
      orgId
    )

    grantedPermissions = Array.from(
      new Set(userExistingPermissions.map((p) => p.permissionName))
    ).sort()
    availablePermissions = Array.from(
      new Set(
        Object.values(templatePermissionRows)
          .filter(({ permissionName }) => !grantedPermissions.includes(permissionName))
          .map((p) => p.permissionName)
      )
    ).sort()
  } else {
    // Get permissions for organisation without association with as user
    const orgExistingPermissions = await databaseConnect.getOrgTemplatePermissions(orgId ?? 0)

    grantedPermissions = Array.from(
      new Set(orgExistingPermissions.map((p) => p.permissionName))
    ).sort()
    availablePermissions = Array.from(
      new Set(
        Object.values(templatePermissionRows)
          .filter(({ permissionName }) => !grantedPermissions.includes(permissionName))
          .map((p) => p.permissionName)
      )
    ).sort()
  }

  // Store array of object per permissionNames with properties and an array of templateCodes
  const templatePermissions: PermissionDetails[] = Object.values(
    templatePermissionRows.reduce(
      (
        templatePermissions,
        {
          permissionNameId,
          permissionName,
          templateCode,
          description,
          policyName,
          isSystemOrgPermission,
        }
      ) => {
        if (!templatePermissions[permissionName])
          templatePermissions[permissionName] = {
            id: permissionNameId,
            name: permissionName,
            description,
            displayName: startCase(permissionName),
            policyName,
            isSystemOrgPermission,
            isUserGranted: grantedPermissions.includes(permissionName),
            templateCodes: [],
          }
        if (
          !!templateCode &&
          !templatePermissions[permissionName].templateCodes.includes(templateCode)
        )
          templatePermissions[permissionName].templateCodes.push(templateCode)
        return templatePermissions
      },
      {}
    )
  )

  return reply.send({
    templatePermissions,
    grantedPermissions,
    availablePermissions,
  })
}

const routeUpdateRowPolicies = async (request: any, reply: any) => {
  // TODO, add parameters to only drop specific policies, for now drop and reinstate them all

  return reply.send(await updateRowPolicies())
}

const routeVerification = async (request: any, reply: any) => {
  const { uid } = request.query
  if (!uid) return reply.send({ success: false, message: 'No verification id provided' })
  try {
    // Get verification record
    const verification = await databaseConnect.getVerification(uid)
    if (!verification) return reply.send({ success: false, message: 'Invalid verification id' })

    // Check already verified
    if (verification.is_verified) return reply.send({ success: false, message: 'Already verified' })

    // Check expiry
    if (verification.time_expired && Date.parse(verification.time_expired) < Date.now())
      return reply.send({ success: false, message: 'Verification expired' })

    // All good! - Update verification record
    const result = await databaseConnect.setVerification(uid)
    if (result) return reply.send({ success: true, message: verification.message })
    else reply.send({ success: false, message: 'Problem with verification' })
  } catch (err) {
    return reply.send({ success: false, message: errorMessage(err) })
  }
}

// Unique name/email/organisation/other check
const routeCheckUnique = async (request: any, reply: any) => {
  const { type, value, table, field, caseInsensitive } = request.query
  if (value === '' || value === undefined) {
    reply.send({
      unique: false,
      message: 'Value not provided',
    })
    return
  }
  let tableName, fieldName
  switch (type) {
    case 'username':
      tableName = 'user'
      fieldName = 'username'
      break
    case 'email':
      tableName = 'user'
      fieldName = 'email'
      break
    case 'organisation':
      tableName = 'organisation'
      fieldName = 'name'
      break
    default:
      if (!table || !field) {
        reply.send({
          unique: false,
          message: 'Type, table, or field missing or invalid',
        })
        return
      } else {
        tableName = table
        fieldName = field
      }
  }
  try {
    const isUnique = await databaseConnect.isUnique(
      tableName,
      fieldName,
      value,
      caseInsensitive == 'false' ? false : true
    )
    reply.send({
      unique: isUnique,
      message: '',
    })
  } catch (err) {
    reply.send({ unique: false, message: errorMessage(err) })
  }
}

export {
  routeUserInfo,
  routeUserPermissions,
  routeLogin,
  routeLoginOrg,
  routeUpdateRowPolicies,
  routeCreateHash,
  routeVerification,
  routeCheckUnique,
}
