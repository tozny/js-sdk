const { v4: uuidv4 } = require('uuid')
const {
  apiUrl,
  idRealmName,
  idAppName,
  clientRegistrationToken,
  testTozIDGroupName,
} = global
const Tozny = require('../node')
const { testEmail } = require('./utils')
const ops = require('./utils/operations')
const { ListIdentitiesResult } = require('../types')

jest.setTimeout(10000000)
let realmConfig
let realm
let identity
let otherIdentity
let username
let password

beforeAll(async () => {
  password = uuidv4()
  username = `it-user-${uuidv4()}`
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
    testEmail(username)
  )
  identity = await realm.login(username, password)
  const otherUsername = `${username}-the-second`
  await realm.register(
    otherUsername,
    password,
    clientRegistrationToken,
    testEmail(otherUsername)
  )
  otherIdentity = await realm.login(otherUsername, password)
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
    emails.push(testEmail(username)) // Current User
    const response = await ops.searchRealmIdentitiesByEmail(
      realmConfig,
      identity,
      emails
    )
    const expectedData = {
      realm_username: username,
      realm_email: testEmail(username),
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
      realm_email: testEmail(username),
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
      testEmail(username)
    )
    const expectedData = {
      realm_username: username,
      realm_email: testEmail(username),
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
      realm_email: testEmail(username),
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
    const reason = 'So many reasons'
    const realmName = realmConfig.realmName
    const accessControlledGroup = {
      id: testTozIDGroupName,
    }
    const accessDurationSeconds = 1000
    const result = await ops.createAccessRequest(
      realmConfig,
      identity,
      realmName,
      [accessControlledGroup],
      reason,
      accessDurationSeconds
    )
    expect(result.id).toBeGreaterThan(0)
    expect(result.accessDurationSeconds).toEqual(accessDurationSeconds)
    expect(result.reason).toEqual(reason)
    expect(result.requestorId).toEqual(identity.storage.config.clientId)
    expect(result.requestor).toHaveProperty('username')
    expect(result.requestor.toznyId).toEqual(result.requestorId)
    expect(result.groups[0].id).toEqual(testTozIDGroupName)
    expect(result.groups[0].groupName).not.toBeUndefined()
  })
  it('it can search for all self created access requests', async () => {
    const reason = 'So many reasons'
    const realmName = realmConfig.realmName
    const accessControlledGroup = {
      id: testTozIDGroupName,
    }
    const accessDurationSeconds = 1000

    const firstAccessRequest = await ops.createAccessRequest(
      realmConfig,
      identity,
      realmName,
      [accessControlledGroup],
      reason,
      accessDurationSeconds
    )
    const secondAccessRequest = await ops.createAccessRequest(
      realmConfig,
      identity,
      realmName,
      [accessControlledGroup],
      reason,
      accessDurationSeconds
    )

    // search for requests this client made!
    const filters = {
      requestorIds: [identity.storage.config.clientId],
    }
    // NOTE: fails due to "Group must have only 1 access policy" but we have none
    // create in 'Manage Realm' via UI to setup policy record
    const searchResults = await ops.searchAccessRequests(
      realmConfig,
      identity,
      filters,
      0, // next token
      10 // limit
    )
    const searchResultAccessRequestIDs = searchResults.accessRequests.map(
      (accessRequest) => accessRequest.id
    )
    expect(searchResultAccessRequestIDs).toEqual(
      expect.arrayContaining([firstAccessRequest.id, secondAccessRequest.id])
    )
  })
  it('it can describe a created access request', async () => {
    const reason = 'So many reasons' + uuidv4()
    const realmName = realmConfig.realmName
    const accessControlledGroup = {
      id: testTozIDGroupName,
    }
    const accessDurationSeconds = 1000
    const createdAccessRequest = await ops.createAccessRequest(
      realmConfig,
      identity,
      realmName,
      [accessControlledGroup],
      reason,
      accessDurationSeconds
    )
    const describedAccessRequest = await ops.describeAccessRequest(
      realmConfig,
      identity,
      createdAccessRequest.id
    )
    expect(describedAccessRequest.reason).toEqual(reason)
  })
  it('it can delete a created access request', async () => {
    const reason = 'So many reasons' + uuidv4()
    const realmName = realmConfig.realmName
    const accessControlledGroup = {
      id: testTozIDGroupName,
    }
    const accessDurationSeconds = 1000
    const createdAccessRequest = await ops.createAccessRequest(
      realmConfig,
      identity,
      realmName,
      [accessControlledGroup],
      reason,
      accessDurationSeconds
    )
    await ops.deleteAccessRequest(
      realmConfig,
      identity,
      createdAccessRequest.id
    )
  })

  it('can approve an access request', async () => {
    const reason = 'Reasons' + uuidv4()
    const realmName = realmConfig.realmName
    const accessControlledGroup = {
      id: testTozIDGroupName,
    }
    const accessDurationSeconds = 1000
    const createdAccessRequest = await ops.createAccessRequest(
      realmConfig,
      identity,
      realmName,
      [accessControlledGroup],
      reason,
      accessDurationSeconds
    )

    // NOTE: fails due to "Group must have only 1 access policy" but we have none
    // create in 'Manage Realm' via UI to setup policy record
    const approval = {
      accessRequestId: createdAccessRequest.id,
      comment: 'COMMENT',
    }
    const response = await ops.approveAccessRequests(
      realmConfig,
      // you can't approve your own requests so a different identity must perform approval.
      // this only works if the approver roles for the group is a default role that all users have.
      otherIdentity,
      realmName,
      [approval]
    )
    expect(response).toBeInstanceOf(Array)
    expect(response).toHaveLength(1)
    expect(response[0].id).toEqual(createdAccessRequest.id)
  })

  it('can deny an access request', async () => {
    const reason = 'Reasons' + uuidv4()
    const realmName = realmConfig.realmName
    const accessControlledGroup = {
      id: testTozIDGroupName,
    }
    const accessDurationSeconds = 1000
    const createdAccessRequest = await ops.createAccessRequest(
      realmConfig,
      identity,
      realmName,
      [accessControlledGroup],
      reason,
      accessDurationSeconds
    )

    // NOTE: fails due to "Group must have only 1 access policy" but we have none
    // create in 'Manage Realm' via UI to setup policy record
    const denial = {
      accessRequestId: createdAccessRequest.id,
      comment: 'COMMENT',
    }
    const response = await ops.denyAccessRequests(
      realmConfig,
      identity,
      realmName,
      [denial]
    )
    expect(response).toBeInstanceOf(Array)
    expect(response).toHaveLength(1)
    expect(response[0].id).toEqual(createdAccessRequest.id)
  })

  it('can list groups with enabled mpc', async () => {
    const realmName = realmConfig.realmName
    const response = await ops.availableAccessRequestGroups(
      realmConfig,
      identity,
      realmName
    )
    expect(response).toBeInstanceOf(Array)
    expect(response.length).toBeGreaterThan(0)
    const group = response[0]
    expect(group.id).not.toBeUndefined()
    expect(group.groupName).not.toBeUndefined()
    expect(group.accessPolicies).not.toBeUndefined()
    expect(group.accessPolicies.length).toBeGreaterThan(0)
    const policy = group.accessPolicies[0]
    expect(policy.id).not.toBeUndefined()
    expect(policy.requiredApprovals).not.toBeUndefined()
    expect(policy.maxAccessDurationSeconds).not.toBeUndefined()
  })

  it('can initiate a webauthn mfa challenge for this client', async () => {
    const response = await ops.initiateWebAuthnChallenge(realmConfig, identity)
    expect(response).not.toBeUndefined()
    expect(typeof response.tabId).toBe('string')
    expect(response.challengeData).toMatchObject({
      challenge: expect.any(String),
      username: expect.stringMatching(username),
      userid: expect.any(String),
      attestationConveyancePreference: expect.any(String),
      authenticatorAttachment: expect.any(String),
      excludeCredentialIds: expect.any(String),
      requireResidentKey: expect.any(String),
      signatureAlgorithms: expect.any(String),
      rpId: expect.any(String),
      rpEntityName: expect.any(String),
      userVerificationRequirement: expect.any(String),
      createTimeout: expect.any(Number),
    })
  })
    it('Registers Identity from a realm ', async () => {

    // List all identities in realm, Expected new identity and sovereign
    // Set max page size to 1 in order to test paging 
      const identityList = new ListIdentitiesResult(identity, realmConfig.realmName, 1, 0)
      let identities = await identityList.next()
    expect(identities).toBeInstanceOf(Array)
    expect(identities).toHaveLength(1)
    
    // second identity should be sovereign client
    // second page
    identities = await identityList.next()
    expect(identities).toBeInstanceOf(Array)
    expect(identities).toHaveLength(1)
    
  })
})
