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
let username2
let password2
beforeAll(async () => {
  username = `it-user-${uuidv4()}`
  password = uuidv4()
  username2 = `it-second-user-${uuidv4()}`
  password2 = uuidv4()
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
  await realm.register(
    username2,
    password2,
    clientRegistrationToken,
    `${username2}@example.com`
  )
  // identity2 = await realm.login(username2, password2)
  /* this is commented out until tests can be written that work with 
    browser and node */
  // fileName = `test-file-${uuidv4()}`
  // fs.writeFile(fileName, 'This is a test file!', err => {
  //   if (err) {
  //     console.log(`Error creating file ${fileName}`, err)
  //   }
  // })
})

// afterAll(async () => {
//   fs.unlink(fileName, err => {
//     if (err) {
//       console.log(`Error deleting file ${fileName}`, err)
//     }
//   })
// })

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
  it('can read a record by recordID', async () => {
    const secret = {
      secretType: 'Credential',
      secretName: `test-secret-${uuidv4()}`,
      secretValue: 'secret-value',
      description: 'this is a description',
    }
    const created = await ops.createSecret(realmConfig, identity, secret)
    const returned = await ops.viewSecret(
      realmConfig,
      identity,
      created.meta.recordId
    )
    expect(created.stringify()).toBe(returned.stringify())
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
  it('gets the latest version of a secret', async () => {
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
    const start = new Date()
    let latestVersionOfSecret
    while (new Date() - start < 30000) {
      latestVersionOfSecret = await ops.getLatestSecret(
        realmConfig,
        identity,
        testName,
        'Credential'
      )
      if (
        latestVersionOfSecret.exists == true &&
        latestVersionOfSecret.results.data.secretValue == 'updatedSecretValue'
      ) {
        break
      }
      // delay 200 milliseconds between tries
      await new Promise(r => setTimeout(r, 200))
    }
    expect(latestVersionOfSecret.exists).toBe(true)
    expect(latestVersionOfSecret.results.data.secretValue).toBe(
      'updatedSecretValue'
    )
  })
  it('it doesnt return the latest version for invalid secret', async () => {
    let latestVersion = await ops.getLatestSecret(
      realmConfig,
      identity,
      `fakeName`,
      'fakeType'
    )
    expect(latestVersion.exists).toBe(false)
  })

  it('can create a secret and share it with a username', async () => {
    const testName = `test-secret-${uuidv4()}`
    const secret = {
      secretType: 'Credential',
      secretName: testName,
      secretValue: 'secret-value',
      description: 'this is a description',
    }
    const testUsername = username2
    const secretCreated = await ops.createSecret(realmConfig, identity, secret)
    const start = new Date()
    await new Promise(r => setTimeout(r, 5000))
    let shareByUserName
    while (new Date() - start < 30000) {
      shareByUserName = await ops.shareSecretWithUsername(
        realmConfig,
        identity,
        testName,
        'Credential',
        testUsername
      )
      if (shareByUserName == secretCreated.meta.type) {
        break
      }
      // delay 200 milliseconds between tries
      await new Promise(r => setTimeout(r, 200))
    }
  })
  it('can handle a silent response with fake username', async () => {
    const testName = `test-secret-${uuidv4()}`
    const secret = {
      secretType: 'Credential',
      secretName: testName,
      secretValue: 'secret-value',
      description: 'this is a description',
    }
    const testUsername = 'fakeUsername1'
    await ops.createSecret(realmConfig, identity, secret)
    await new Promise(r => setTimeout(r, 500))
    const shareByUsername = await ops.shareSecretWithUsername(
      realmConfig,
      identity,
      testName,
      'Credential',
      testUsername
    )
    expect(shareByUsername).toBe(null)
  })
  it('it can share a secret and unshare', async () => {
    const testName = `updated-${uuidv4()}`
    const secret = {
      secretType: 'Credential',
      secretName: testName,
      secretValue: 'secret-value',
      description: 'this is a description',
    }
    const testUsername = username2
    const secretCreated = await ops.createSecret(realmConfig, identity, secret)
    const start = new Date()
    await new Promise(r => setTimeout(r, 5000))
    let shareByUsername
    while (new Date() - start < 30000) {
      shareByUsername = await ops.shareSecretWithUsername(
        realmConfig,
        identity,
        testName,
        'Credential',
        testUsername
      )
      if (shareByUsername != null) {
        break
      }
      // delay 200 milliseconds between tries
      await new Promise(r => setTimeout(r, 200))
    }
    expect(shareByUsername).toBe(secretCreated.meta.type)
    let unshareByUsername = await ops.revokeSecretFromUser(
      realmConfig,
      identity,
      testName,
      'Credential',
      testUsername
    )

    expect(unshareByUsername).toBe(true)
  })

  it('can get a list of secret shared', async () => {
    const testName = `test-secret-${uuidv4()}`
    const secret = {
      secretType: 'Credential',
      secretName: testName,
      secretValue: 'secret-value',
      description: 'this is a description',
    }
    const testUsername = username2
    await ops.createSecret(realmConfig, identity, secret)
    const start = new Date()
    await new Promise(r => setTimeout(r, 5000))
    let shareByUsername
    while (new Date() - start < 30000) {
      shareByUsername = await ops.shareSecretWithUsername(
        realmConfig,
        identity,
        testName,
        'Credential',
        testUsername
      )
      if (shareByUsername != null) {
        break
      }
      // delay 200 milliseconds between tries
      await new Promise(r => setTimeout(r, 200))
    }
    const list = await ops.getSecretSharedList(
      realmConfig,
      identity,
      testName,
      'Credential'
    )
    expect(list[0].username).toBe(testUsername)
  })
  it('can return an empty list if not shared', async () => {
    const testName = `test-secret-${uuidv4()}`
    const secret = {
      secretType: 'Credential',
      secretName: testName,
      secretValue: 'secret-value',
      description: 'this is a description',
    }
    await ops.createSecret(realmConfig, identity, secret)
    const list = await ops.getSecretSharedList(
      realmConfig,
      identity,
      testName,
      'Credential'
    )
    expect(JSON.stringify(list)).toBe(JSON.stringify([]))
  })
  /* These tests are for node only, which means that they will fail the browsers tests on
    travis. These will be updated shortly to work with both browser and node. */
  // it('can create a secret with a file type', async () => {
  //   const file = fs.createReadStream(fileName, { encoding: 'utf8' })
  //   const testName = `test-secret-${uuidv4()}`
  //   const secret = {
  //     secretType: 'File',
  //     secretName: testName,
  //     secretValue: '',
  //     fileName: fileName,
  //     file: file,
  //     description: 'this contains a file',
  //   }
  //   const secretTest = {
  //     meta: {
  //       type: `tozny.secret.${SECRET_UUID}.${secret.secretType}.${secret.secretName}`,
  //       plain: {
  //         description: secret.description,
  //         secretName: secret.secretName,
  //         secretType: secret.secretType,
  //         fileName: secret.fileName,
  //       },
  //     },
  //   }
  //   const secretResp = await ops.createSecret(realmConfig, identity, secret)
  //   expect(secretResp).toMatchObject(secretTest)
  // })
  // it('can view a secret with a file type', async () => {
  //   const file = fs.createReadStream(fileName, { encoding: 'utf8' })
  //   const testName = `test-secret-${uuidv4()}`
  //   const secret = {
  //     secretType: 'File',
  //     secretName: testName,
  //     secretValue: '',
  //     fileName: fileName,
  //     file: file,
  //     description: 'this contains a file',
  //   }
  //   const created = await ops.createSecret(realmConfig, identity, secret)
  //   const returned = await ops.getFile(
  //     realmConfig,
  //     identity,
  //     created.meta.recordId
  //   )
  //   await Tozny.helpers.saveFile(returned, `downloaded-${fileName}`)
  //   fs.readFile(
  //     `downloaded-${fileName}`,
  //     { encoding: 'utf-8' },
  //     (err, data) => {
  //       if (err) {
  //         console.log(`Error downloading file downloaded-${fileName}`, err)
  //       }
  //       expect(data).toBe('This is a test file!')
  //     }
  //   )
  //   fs.unlink(`downloaded-${fileName}`, err => {
  //     if (err) {
  //       console.log(`Error deleting file downloaded-${fileName}`, err)
  //     }
  //   })
  // })
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
