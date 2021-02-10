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
    const testName = `test-secret-${uuidv4()}`
    const secret = {
      secretType: 'Credential',
      secretName: testName,
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
    const testName = `test-secret-${uuidv4()}`
    const secret = {
      secretType: 'Credential',
      secretName: testName,
      secretValue: 'secret-value',
      description: 'this is a description',
    }
    // use local search to wait
    await ops.createSecret(realmConfig, identity, secret)
    // wait for proper indexing of secret
    let query = await identity.getSecrets(10)
    await waitForNextOfName(query, testName)
    // run list in test environment
    let result = await ops.getSecrets(realmConfig, identity, 10)
    expect(result[0].data.secretValue).toBe('secret-value')
    expect(result[0].meta.plain.secretType).toBe('Credential')
  })
  it('can create a secret and update', async () => {
    const testName = `test-secret-${uuidv4()}`
    const oldSecret = {
      secretType: 'Credential',
      secretName: testName,
      secretValue: 'secret-value',
      description: 'this is a description',
    }
    const newSecret = {
      secretType: 'Credential',
      secretName: testName,
      secretValue: 'updatedSecretValue',
      description: 'this is a description',
    }
    await ops.createSecret(realmConfig, identity, oldSecret)
    await ops.updateSecret(realmConfig, identity, oldSecret, newSecret)
    const query = await identity.getSecrets(100)
    const secretsWithUpdatedRecord = await waitForNextOfName(query, testName, 2)
    const newLengthSecrets = secretsWithUpdatedRecord.length
    // Tests
    expect(
      secretsWithUpdatedRecord[newLengthSecrets - 1].data.secretValue
    ).toBe('updatedSecretValue') // the new Secret is also created
  })
  it('cannot update secret of different type', async () => {
    const testName = `test-secret-${uuidv4()}`
    const oldSecret = {
      secretType: 'Credential',
      secretName: testName,
      secretValue: 'secret-value',
      description: 'this is a description',
    }
    const newSecret = {
      secretType: 'Note',
      secretName: testName,
      secretValue: 'updatedSecretValue',
      description: 'this is a description',
    }
    await ops.createSecret(realmConfig, identity, oldSecret)
    expect(
      ops.updateSecret(realmConfig, identity, oldSecret, newSecret)
    ).rejects.toThrow()
  })
  it('cannot update secret of different name', async () => {
    const testName = `test-secret-${uuidv4()}`
    const notTestName = `test-secret-${uuidv4()}`
    const oldSecret = {
      secretType: 'Credential',
      secretName: testName,
      secretValue: 'secret-value',
      description: 'this is a description',
    }
    const newSecret = {
      secretType: 'Credential',
      secretName: notTestName,
      secretValue: 'updatedSecretValue',
      description: 'this is a description',
    }
    await ops.createSecret(realmConfig, identity, oldSecret)
    expect(
      ops.updateSecret(realmConfig, identity, oldSecret, newSecret)
    ).rejects.toThrow()
  })
})

/**
 * Returns a search result filtered to contain only the secrets with the given name
 *
 * If numRequired is set, then it will ensure the results contains at least that many
 * secret are found. By default it ensures at least one secret of the given name
 * exists before returning.
 *
 * If the result gets to the end of the 10 second timeout period, this method throws.
 *
 * @param {SearchResult} query A secrets search result
 * @param {string} name The name of the secrets being looked for
 * @param {int} numRequired The number of secrets which should be found before returning
 */
async function waitForNextOfName(query, name, numRequired = 1) {
  const floor = numRequired - 1
  let filtered
  const results = await ops.waitForNext(query, found => {
    filtered = found.filter(i => i.meta.plain.secretName === name)
    return filtered.length > floor
  })
  if (filtered.length < numRequired) {
    const stringifiedResults = JSON.stringify(results, null, '  ')
    throw new Error(
      `Did not find ${numRequired} secret{s} with name ${name} in results: ${stringifiedResults}`
    )
  }
  return filtered
}
