// const { v4: uuidv4 } = require('uuid')
// const { apiUrl, clientRegistrationToken, idRealmName, idAppName } = global
// const Tozny = require('../node')
// const ops = require('./utils/operations')

// Set really high for slower browser runs.
// jest.setTimeout(100000)

// let realmConfig
// let realm
// let identity
// let username
// let password
// beforeAll(async () => {
//   username = `it-user-${uuidv4()}`
//   password = uuidv4()
//   realmConfig = {
//     realmName: idRealmName,
//     appName: idAppName,
//     brokerTargetUrl: 'http://integrationtest.local.tozny.com',
//     apiUrl,
//   }
//   realm = new Tozny.identity.Realm(
//     realmConfig.realmName,
//     realmConfig.appName,
//     realmConfig.brokerTargetUrl,
//     apiUrl
//   )
//   identity = await realm.register(
//     username,
//     password,
//     clientRegistrationToken,
//     `${username}@example.com`
//   )
// })

describe('Tozny', () => {
  it('skip identity tests (validate test environment)', async () => {
    const result = await global.runInEnvironment(function(boolJSON) {
      var boolVal = JSON.parse(boolJSON)
      return boolVal
    }, JSON.stringify(true))
    return expect(JSON.parse(result)).toBe(true)
  })
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
  // })
})
