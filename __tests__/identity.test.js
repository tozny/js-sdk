const { v4: uuidv4 } = require('uuid')
const { apiUrl, idRealmName, idAppName, clientRegistrationToken } = global
const Tozny = require('../node')
const ops = require('./utils/operations')

<<<<<<< HEAD
jest.setTimeout(10000000)
=======
jest.setTimeout(100000)
>>>>>>> 57aebda... js support for private realm info endpoint

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
    const response = await ops.findIdentityByEmail(
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
    const response = await ops.findIdentityByUsername(
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
    console.log(info)
  })
})

// describe('Tozny', () => {
//   it('skip identity tests (validate test environment)', async () => {
//     const result = await global.runInEnvironment(function (boolJSON) {
//       var boolVal = JSON.parse(boolJSON)
//       return boolVal
//     }, JSON.stringify(true))
//     return expect(JSON.parse(result)).toBe(true)
//   })
// it('can register an identity client', async () => {
//   const user = await ops.registerIdentity(realmConfig, realm)
//   // Basic exist check to ensure we got back a full identity user.
//   expect(user.config).toMatchObject(realmConfig)
//   expect(user.config.username).toEqual(
//     expect.stringMatching(/^integration-user-/)
//   )
//   expect(user.storage).toBeInstanceOf(Tozny.storage.Client)
// })
// it('can log in to a realm', async () => {
//   const user = await ops.login(realmConfig, realm, username, password)
//   expect(user.serialize()).toMatchObject(identity.serialize())
// })
// it('can fetch a token', async () => {
//   const info = await ops.userMethod(realmConfig, identity, 'tokenInfo')
//   expect(info.access_token).toBeTruthy()
//   const token = await ops.userMethod(realmConfig, identity, 'token')
//   expect(token).toBeTruthy()
//   // })
// })
