const uuidv4 = require('uuid/v4')
const {
  runInEnvironment,
  apiUrl,
  clientRegistrationToken,
  idRealmName,
  idAppName,
} = global
const Tozny = require('../node')

// Set really high for slower browser runs.
jest.setTimeout(100000)

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
  identity = await realm.register(
    username,
    password,
    clientRegistrationToken,
    `${username}@example.com`
  )
})

describe('Tozny', () => {
  it('can register an identity client', async () => {
    const user = await registerIdentity()
    // Basic exist check to ensure we got back a full identity user.
    expect(user.config).toMatchObject(realmConfig)
    expect(user.config.username).toEqual(
      expect.stringMatching(/^integration-user-/)
    )
    expect(user.storage).toBeInstanceOf(Tozny.storage.Client)
  })

  it('can log in to a realm', async () => {
    const user = await login(username, password)
    expect(user.serialize()).toMatchObject(identity.serialize())
  })

  it('can fetch a token', async () => {
    const info = await userMethod(identity, 'tokenInfo')
    expect(info.access_token).toBeTruthy()
    const token = await userMethod(identity, 'token')
    expect(token).toBeTruthy()
  })
})

// Utilities to help with running things in the configured environment
async function registerIdentity() {
  const username = `integration-user-${uuidv4()}@example.com`
  const password = uuidv4()
  const user = await runInEnvironment(
    function(realmJSON, clientRegistrationToken, username, password) {
      const realmConfig = JSON.parse(realmJSON)
      const realm = new Tozny.identity.Realm(
        realmConfig.realmName,
        realmConfig.appName,
        realmConfig.brokerTargetUrl,
        realmConfig.apiUrl
      )
      return realm
        .register(
          username,
          password,
          clientRegistrationToken,
          `${username}@example.com`
        )
        .then(function(user) {
          return user.stringify()
        })
    },
    JSON.stringify(realmConfig),
    clientRegistrationToken,
    username,
    password
  )
  return realm.fromObject(user)
}

async function login(username, password) {
  const user = await runInEnvironment(
    function(realmJSON, username, password) {
      const realmConfig = JSON.parse(realmJSON)
      const realm = new Tozny.identity.Realm(
        realmConfig.realmName,
        realmConfig.appName,
        realmConfig.brokerTargetUrl,
        realmConfig.apiUrl
      )
      return realm.login(username, password).then(function(user) {
        return user.stringify()
      })
    },
    JSON.stringify(realmConfig),
    username,
    password
  )
  return realm.fromObject(user)
}

async function userMethod(user, method) {
  const userConfig = await runInEnvironment(
    function(realmJSON, userJSON, method) {
      const realmConfig = JSON.parse(realmJSON)
      const realm = new Tozny.identity.Realm(
        realmConfig.realmName,
        realmConfig.appName,
        realmConfig.brokerTargetUrl,
        realmConfig.apiUrl
      )
      const user = realm.fromObject(userJSON)
      return user[method]().then(JSON.stringify)
    },
    JSON.stringify(realmConfig),
    user.stringify(),
    method
  )
  return JSON.parse(userConfig)
}
