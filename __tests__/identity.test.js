const { v4: uuidv4 } = require('uuid')
const {
  apiUrl,
  idRealmName,
  idAppName,
  clientRegistrationToken,
  testTozIDGroupName,
} = global
const Tozny = require('../node')
const { AccessRequest, AccessRequestSearchRequest } = require('../types')
const ops = require('./utils/operations')

jest.setTimeout(10000000)

let realmConfig
let realm
let identity
let username
let password
beforeAll(async () => {
  username = `it-user-${uuidv4()}`
  password = uuidv4()
  realmConfig = {
    realmName: idRealmName,
    appName: idAppName,
    brokerTargetUrl: 'http://integrationtest.local.tozny.com',
    apiUrl,
  }
  realm = new Tozny.identity.Realm(
    realmConfig.realmName,
    realmConfig.appName,
    realmConfig.brokerTargetUrl,
    apiUrl
  )
  await realm.register(
    username,
    password,
    clientRegistrationToken,
    `${username}@example.com`
  )
  identity = await realm.login(username, password)
})
describe('Tozny identity client', () => {
  it('can use refresh tokens to extend its session', async () => {
    const session = await realm.login(username, password)
    const currentInfo = await session.agentInfo()
    const fiveAgo = new Date()
    fiveAgo.setDate(fiveAgo.getDate() - 5 * 60 * 1000) // 5 minutes ago
    session._agentToken.expires = fiveAgo
    session._agentToken.refreshExpires = fiveAgo
    const refreshed = await session.agentInfo()
    // Ensure we have fetched new tokens
    expect(refreshed.access_token).not.toBe(currentInfo.access_token)
    expect(refreshed.refresh_token).not.toBe(currentInfo.refresh_token)
  })
  it('can do identity look ups based on emails', async () => {
    let emails = []
    emails.push(`${username}@example.com`) // Current User
    const response = await ops.searchRealmIdentitiesByEmail(
      realmConfig,
      identity,
      emails
    )
    const expectedData = {
      realm_username: username,
      realm_email: `${username}@example.com`,
    }
    expect(response.search_criteria).toBe('Email')
    expect(response.searched_identities_information[0]).toMatchObject(
      expectedData
    )
  })
  it('can do identity look ups based on usernames', async () => {
    let usernames = []
    usernames.push(username) // Current User
    const response = await ops.searchRealmIdentitiesByUsername(
      realmConfig,
      identity,
      usernames
    )
    const expectedData = {
      realm_username: username,
      realm_email: `${username}@example.com`,
    }
    expect(response.search_criteria).toBe('Username')
    expect(response.searched_identities_information[0]).toMatchObject(
      expectedData
    )
  })
  it('can do identity look ups on fake username', async () => {
    let usernames = []
    usernames.push('fakeUser11')
    const response = await ops.searchRealmIdentitiesByUsername(
      realmConfig,
      identity,
      usernames
    )
    expect(response.search_criteria).toBe('Username')
    expect(response.searched_identities_information).toBe(null)
  })
  it('can do an identity look up based on email', async () => {
    const response = await ops.searchIdentityByEmail(
      realmConfig,
      identity,
      `${username}@example.com`
    )
    const expectedData = {
      realm_username: username,
      realm_email: `${username}@example.com`,
    }
    expect(response).toMatchObject(expectedData)
  })
  it('can do an identity look up based on username', async () => {
    const response = await ops.searchIdentityByUsername(
      realmConfig,
      identity,
      username
    )
    const expectedData = {
      realm_username: username,
      realm_email: `${username}@example.com`,
    }
    expect(response).toMatchObject(expectedData)
  })
  it('it can get private realm info', async () => {
    const info = await ops.privateRealmInfo(realmConfig, identity)
    const expectedResult = {
      name: realmConfig.realmName,
      secrets_enabled: false,
    }
    expect(info).toMatchObject(expectedResult)
  })
  it('it can create an access request', async () => {
    const reason = 'Debug prod'
    const requestorID = identity.storage.config.clientId
    const realmName = realmConfig.realmName
    const accessControlledGroup = {
      ID: testTozIDGroupName,
    }
    const accessDurationSeconds = 1000
    const params = new AccessRequest(
      reason,
      requestorID,
      realmName,
      [accessControlledGroup],
      accessDurationSeconds
    )
    const result = await identity.createAccessRequest(params)
    expect(result.ID).toBeGreaterThan(0)
  })
  it('it can search for all self created access requests', async () => {
    const reason = 'Debug prod'
    const requestorID = identity.storage.config.clientId
    const realmName = realmConfig.realmName
    const accessControlledGroup = {
      ID: testTozIDGroupName,
    }
    const accessDurationSeconds = 1000
    const createAccessRequestParams = new AccessRequest(
      reason,
      requestorID,
      realmName,
      [accessControlledGroup],
      accessDurationSeconds
    )
    const firstAccessRequest = await identity.createAccessRequest(
      createAccessRequestParams
    )
    const secondAccessRequest = await identity.createAccessRequest(
      createAccessRequestParams
    )

    const searchByRequestorIDsParams = [requestorID]
    const searchResults = await identity.searchAccessRequests(
      searchByRequestorIDsParams
    )
    const searchResultAccessRequestIDs = searchResults.accessRequests.map(
      (accessRequest) => accessRequest.ID
    )
    expect(searchResultAccessRequestIDs).toEqual(
      expect.arrayContaining([firstAccessRequest.ID, secondAccessRequest.ID])
    )
  })
  it('it can describe a created access request', async () => {
    const reason = 'Debug prod' + uuidv4()
    const requestorID = identity.storage.config.clientId
    const realmName = realmConfig.realmName
    const accessControlledGroup = {
      ID: testTozIDGroupName,
    }
    const accessDurationSeconds = 1000
    const params = new AccessRequest(
      reason,
      requestorID,
      realmName,
      [accessControlledGroup],
      accessDurationSeconds
    )
    const createdAccessRequest = await identity.createAccessRequest(params)
    const describedAccessRequest = await identity.describeAccessRequest(
      createdAccessRequest.ID
    )
    expect(describedAccessRequest.reason).toEqual(reason)
  })
  it('it can delete a created access request', async () => {
    const reason = 'Debug prod' + uuidv4()
    const requestorID = identity.storage.config.clientId
    const realmName = realmConfig.realmName
    const accessControlledGroup = {
      ID: testTozIDGroupName,
    }
    const accessDurationSeconds = 1000
    const params = new AccessRequest(
      reason,
      requestorID,
      realmName,
      [accessControlledGroup],
      accessDurationSeconds
    )
    const createdAccessRequest = await identity.createAccessRequest(params)
    await identity.deleteAccessRequest(createdAccessRequest.ID)
  })
})
