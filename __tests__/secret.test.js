const { v4: uuidv4 } = require('uuid')
const { apiUrl, idRealmName, idAppName } = global
const Tozny = require('../node')
const ops = require('./utils/operations')
const { SECRET_UUID } = require('../lib/utils/constants')
const username = process.env.USERNAME
const password = process.env.PASSWORD

jest.setTimeout(100000)

let realmConfig
let realm
let identity
beforeAll(async () => {
  realmConfig = {
    realmName: idRealmName,
    appName: idAppName,
    brokerTargetUrl: `http://localhost:8080/${idRealmName}/recover`,
    apiUrl,
  }
  realm = new Tozny.identity.Realm(
    realmConfig.realmName,
    realmConfig.appName,
    realmConfig.brokerTargetUrl,
    apiUrl
  )
  identity = await realm.login(username, password)
})

describe('Tozny identity client', () => {
  it('can create a secret', async () => {
    const secret = {
      secretType: 'Credential',
      secretName: `test-secret-${uuidv4()}`,
      secretValue: 'secret-value',
      description: 'this is a description',
    }
    const secretTest = {
      meta: {
        type: `tozny.secret.${SECRET_UUID}.${secret.secretType}.${secret.secretName}`,
        plain: {
          description: secret.description,
          secretName: secret.secretName,
          secretType: secret.secretType,
        },
      },
      data: {
        secretValue: secret.secretValue,
      },
    }
    const secretResp = await ops.createSecret(realmConfig, identity, secret)
    expect(secretResp).toMatchObject(secretTest)
  })
})
