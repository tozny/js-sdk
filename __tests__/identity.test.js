const { v4: uuidv4 } = require('uuid')
const { apiUrl, idRealmName, idAppName, clientRegistrationToken } = global
const Tozny = require('../node')
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
  it('it can get private realm info', async () => {
    const info = await ops.privateRealmInfo(realmConfig, identity)
    const expectedResult = {
      name: realmConfig.realmName,
      secrets_enabled: false,
    }
    expect(info).toMatchObject(expectedResult)
  })
})
