const { v4: uuidv4 } = require('uuid')
const { apiUrl, idRealmName, idAppName, clientRegistrationToken } = global
const Tozny = require('../node')
const ops = require('./utils/operations')
const { SECRET_UUID } = require('../lib/utils/constants')

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
  await realm.register(
    username,
    password,
    clientRegistrationToken,
    `${username}@example.com`
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
  it('fails to create secret when name or value is not valid', async () => {
    const secretTypeEmpty = {
      secretType: '',
      secretName: 'SecretName',
      secretValue: 'secret-value',
      description: 'this is a description',
    }
    const secretTypeInvalid = {
      secretType: 'Cred',
      secretName: 'SecretName',
      secretValue: 'secret-value',
      description: 'this is a description',
    }
    const secretNameEmpty = {
      secretType: 'Credential',
      secretName: '',
      secretValue: 'secret-value',
      description: 'this is a description',
    }
    const secretNameInvalid = {
      secretType: 'Credential',
      secretName: `test-secret#-${uuidv4()}`,
      secretValue: 'secret-value',
      description: 'this is a description',
    }
    const secretValueEmpty = {
      secretType: 'Credential',
      secretName: `test-secret-${uuidv4()}`,
      secretValue: '',
      description: 'this is a description',
    }
    expect(ops.createSecret(secretTypeEmpty)).rejects.toThrow()
    expect(ops.createSecret(secretTypeInvalid)).rejects.toThrow()
    expect(ops.createSecret(secretNameEmpty)).rejects.toThrow()
    expect(ops.createSecret(secretNameInvalid)).rejects.toThrow()
    expect(ops.createSecret(secretValueEmpty)).rejects.toThrow()
  })
  it('can create a secret, and list it', async () => {
    const secret = {
      secretType: 'Credential',
      secretName: `test-secret-${uuidv4()}`,
      secretValue: 'secret-value',
      description: 'this is a description',
    }
    await ops.createSecret(realmConfig, identity, secret)
    await new Promise(r => setTimeout(r, 1000))
    let query = await ops.getSecrets(realmConfig, identity, 10)
    const result = await query.next()
    expect(result[0].data.secretValue).toBe('secret-value')
    expect(result[0].meta.plain.secretType).toBe('Credential')
  })
  it('can create a secret and update', async () => {
    const oldSecret = {
      secretType: 'Credential',
      secretName: `test-secret-updatetest35558800`,
      secretValue: 'secret-value',
      description: 'this is a description',
    }
    const newSecret = {
      secretType: 'Credential',
      secretName: `test-secret-updatetest35558800`,
      secretValue: 'updatedSecretValue',
      description: 'this is a description',
    }
    await ops.createSecret(realmConfig, identity, oldSecret)
    await new Promise(r => setTimeout(r, 1000))
    const query = await ops.getSecrets(realmConfig, identity, 10)
    let secrets = await query.next()
    let lengthSecrets = secrets.length
    await ops.updateSecret(realmConfig, identity, oldSecret, newSecret)
    await new Promise(r => setTimeout(r, 10000))
    const query2 = await ops.getSecrets(realmConfig, identity, 100)
    let secretsWithUpdatedRecord = await query2.next()
    let newLengthSecrets = secretsWithUpdatedRecord.length
    // Tests
    expect(secretsWithUpdatedRecord[newLengthSecrets - 2].meta.recordId).toBe(
      secrets[lengthSecrets - 1].meta.recordId
    ) // This shows that the "oldSecret" is still on the list
    expect(
      secretsWithUpdatedRecord[newLengthSecrets - 1].data.secretValue
    ).toBe('updatedSecretValue') // the new Secret is also created
  })
  it('cannot update secret of different type', async () => {
    const oldSecret = {
      secretType: 'Credential',
      secretName: `test-secret-updatetest35558800`,
      secretValue: 'secret-value',
      description: 'this is a description',
    }
    const newSecret = {
      secretType: 'Note',
      secretName: `test-secret-updatetest35558800`,
      secretValue: 'updatedSecretValue',
      description: 'this is a description',
    }
    await ops.createSecret(realmConfig, identity, oldSecret)
    expect(
      ops.updateSecret(realmConfig, identity, oldSecret, newSecret)
    ).rejects.toThrow()
  })
  it('cannot update secret of different name', async () => {
    const oldSecret = {
      secretType: 'Credential',
      secretName: `test-secret-updatetest35558800`,
      secretValue: 'secret-value',
      description: 'this is a description',
    }
    const newSecret = {
      secretType: 'Credential',
      secretName: `test-secret`,
      secretValue: 'updatedSecretValue',
      description: 'this is a description',
    }
    await ops.createSecret(realmConfig, identity, oldSecret)
    expect(
      ops.updateSecret(realmConfig, identity, oldSecret, newSecret)
    ).rejects.toThrow()
  })
  it('gets the latest version of a secret', async () => {
    const oldSecret = {
      secretType: 'Credential',
      secretName: `test-secret-updatetest35558800`,
      secretValue: 'secret-value',
      description: 'this is a description',
    }
    const newSecret = {
      secretType: 'Credential',
      secretName: `test-secret-updatetest35558800`,
      secretValue: 'updatedSecretValue',
      description: 'this is a description',
    }
    await ops.createSecret(realmConfig, identity, oldSecret)
    await ops.updateSecret(realmConfig, identity, oldSecret, newSecret)
    await new Promise(r => setTimeout(r, 10000))
    let latestVersion = await ops.getLatestSecret(
      realmConfig,
      identity,
      `test-secret-updatetest35558800`,
      'Credential'
    )
    expect(latestVersion.exists).toBe(true)
    expect(latestVersion.result.data.secretValue).toBe('updatedSecretValue')
  })
  it('gets the latest version of an invalid secret', async () => {
    let latestVersion = await ops.getLatestSecret(
      realmConfig,
      identity,
      `fakeName`,
      'fakeType'
    )
    expect(latestVersion.exists).toBe(false)
  })
})
