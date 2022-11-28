const { v4: uuidv4 } = require('uuid')
const { apiUrl, idRealmName, idAppName, clientRegistrationToken } = global
const Tozny = require('../node')
const ops = require('./utils/operations')
const { SECRET_UUID } = require('../lib/utils/constants')
const { testEmail } = require('./utils')

jest.setTimeout(100000)

let realmConfig
let realm
let identity
let identity2
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
    testEmail(username)
  )
  identity = await realm.login(username, password)
  await realm.register(
    username2,
    password2,
    clientRegistrationToken,
    testEmail(username2)
  )
  identity2 = await realm.login(username2, password2)
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
  it('can create a credential secret', async () => {
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
  it('can create a client secret', async () => {
    const testName = `test-secret-${uuidv4()}`
    const secret = {
      secretType: 'Client',
      secretName: testName,
      secretValue: `{
        "version": "2",
        "public_signing_key": "A5QXkIKW5dBN_IOhjGoUBtT-xuVmqRXDB2uaqiKuTao",
        "private_signing_key": "qIqG9_81kd2gOY-yggIpahQG1MDnlBeQj7G4MHa5p0E1WapQxLVlyU6hXA6rp-Ci5DFf8g6GMaqy5t_H1g5Nqg",
        "client_id": "4f20ca95-1b3b-b78f-b5bd-6d469ac804eb",
        "api_key_id": "63807026e9a23850307429e52d2f607eaa5be43488cbb819b075ade91735b180",
        "api_secret": "730e6b18dc9668fe1758304283c73060619f6596f11bf42bdd3f16d6fc6cd6d0",
        "public_key": "6u73qLgJniPi9S2t99A7lNfvi3xjxMsPB_Z-CEGWZmo",
        "private_key": "BnBt9_tquBvSAHL04bQm0HkQ7eXtvuj1WSHegQeho6E",
        "api_url": "http://platform.local.tozny.com:8000",
        "client_email": ""
      }`,
      description: 'a client credential secret',
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
  it('fails to create client secret when name or value is not valid', async () => {
    const secretMissingField = {
      secretType: 'Client',
      secretName: 'secretMissingField',
      secretValue: `{
        "public_signing_key": "A5QXkIKW5dBN_IOhjGoUBtT-xuVmqRXDB2uaqiKuTao",
        "private_signing_key": "qIqG9_81kd2gOY-yggIpahQG1MDnlBeQj7G4MHa5p0E1WapQxLVlyU6hXA6rp-Ci5DFf8g6GMaqy5t_H1g5Nqg",
        "client_id": "4f20ca95-1b3b-b78f-b5bd-6d469ac804eb",
        "api_key_id": "63807026e9a23850307429e52d2f607eaa5be43488cbb819b075ade91735b180",
        "api_secret": "730e6b18dc9668fe1758304283c73060619f6596f11bf42bdd3f16d6fc6cd6d0",
        "public_key": "6u73qLgJniPi9S2t99A7lNfvi3xjxMsPB_Z-CEGWZmo",
        "private_key": "BnBt9_tquBvSAHL04bQm0HkQ7eXtvuj1WSHegQeho6E",
        "api_url": "http://platform.local.tozny.com:8000",
        "client_email": ""
      }`,
      description: 'this is missing a required field',
    }
    const secretClientNotUUID = {
      secretType: 'Client',
      secretName: 'secretClientNotUUID',
      secretValue: `{
        "version": "2",
        "public_signing_key": "A5QXkIKW5dBN_IOhjGoUBtT-xuVmqRXDB2uaqiKuTao",
        "private_signing_key": "qIqG9_81kd2gOY-yggIpahQG1MDnlBeQj7G4MHa5p0E1WapQxLVlyU6hXA6rp-Ci5DFf8g6GMaqy5t_H1g5Nqg",
        "client_id": "4",
        "api_key_id": "63807026e9a23850307429e52d2f607eaa5be43488cbb819b075ade91735b180",
        "api_secret": "730e6b18dc9668fe1758304283c73060619f6596f11bf42bdd3f16d6fc6cd6d0",
        "public_key": "6u73qLgJniPi9S2t99A7lNfvi3xjxMsPB_Z-CEGWZmo",
        "private_key": "BnBt9_tquBvSAHL04bQm0HkQ7eXtvuj1WSHegQeho6E",
        "api_url": "http://platform.local.tozny.com:8000",
        "client_email": ""
      }`,
      description: 'the client id is not a uuid',
    }
    const secretInvalidKeyLength = {
      secretType: 'Client',
      secretName: 'secretInvalidKeyLength',
      secretValue: `{
        "version": "2",
        "public_signing_key": "A5QXkIKW5dBN_IOhjGoUBtT-xuVmqRXDB2uaqiKuTao",
        "private_signing_key": "qIq1WapQxLVlyU6hXA6rp-Ci5DFf8g6GMaqy5t_H1g5Nqg",
        "client_id": "4f20ca95-1b3b-b78f-b5bd-6d469ac804eb",
        "api_key_id": "63807026e9a23850307429e52d2f607eaa5be43488cbb819b075ade91735b180",
        "api_secret": "730e6b18dc9668fe1758304283c73060619f6596f11bf42bdd3f16d6fc6cd6d0",
        "public_key": "6u73qLgJniPi9S2t99A7lNfvi3xjxMsPB_Z-CEGWZmo",
        "private_key": "BnBt9_tquBvSAHL04bQm0HkQ7eXtvuj1WSHegQeho6E",
        "api_url": "http://platform.local.tozny.com:8000",
        "client_email": ""
      }`,
      description: 'private signing key is invalid length',
    }
    const secretValueEmpty = {
      secretType: 'Client',
      secretName: 'secretValueEmpty',
      secretValue: '',
      description: 'value is empty',
    }
    expect(ops.createSecret(secretMissingField)).rejects.toThrow()
    expect(ops.createSecret(secretClientNotUUID)).rejects.toThrow()
    expect(ops.createSecret(secretInvalidKeyLength)).rejects.toThrow()
    expect(ops.createSecret(secretValueEmpty)).rejects.toThrow()
  })
  it('fails to create credential secret when name or value is not valid', async () => {
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
    await new Promise((r) => setTimeout(r, 5000))
    let result = await ops.getSecrets(realmConfig, identity, 10)
    expect(result.list[result.list.length - 1].data.secretValue).toBe(
      'secret-value'
    )
  })
  it('can read a record by recordID', async () => {
    const secret = {
      secretType: 'Credential',
      secretName: `test-secret-${uuidv4()}`,
      secretValue: 'secret-value',
      description: 'this is a description',
    }
    const created = await ops.createSecret(realmConfig, identity, secret)
    await new Promise((r) => setTimeout(r, 5000))
    const returned = await ops.viewSecret(
      realmConfig,
      identity,
      created.meta.recordId
    )
    expect(created.meta.recordId).toBe(returned.secret.meta.recordId)
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
    await new Promise((r) => setTimeout(r, 5000))
    const secretsWithUpdatedRecord = await identity.getSecrets(100)
    const newLengthSecrets = secretsWithUpdatedRecord.list.length
    // Tests
    expect(
      secretsWithUpdatedRecord.list[newLengthSecrets - 1].data.secretValue
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
    await new Promise((r) => setTimeout(r, 5000))
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
      await new Promise((r) => setTimeout(r, 200))
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
    await new Promise((r) => setTimeout(r, 5000))
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
      await new Promise((r) => setTimeout(r, 200))
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
    await new Promise((r) => setTimeout(r, 500))
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
    await new Promise((r) => setTimeout(r, 5000))
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
      await new Promise((r) => setTimeout(r, 200))
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
    await new Promise((r) => setTimeout(r, 5000))
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
      await new Promise((r) => setTimeout(r, 200))
    }
    await new Promise((r) => setTimeout(r, 5000))
    const listResponse = await ops.getSecretSharedList(
      realmConfig,
      identity,
      testName,
      'Credential'
    )
    expect(listResponse.list[0].username).toBe(testUsername)
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
    const listResponse = await ops.getSecretSharedList(
      realmConfig,
      identity,
      testName,
      'Credential'
    )
    expect(listResponse.list).toMatchObject([])
  })
  it('can create a secret and share it with a username and list the shared records', async () => {
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
    await new Promise((r) => setTimeout(r, 5000))
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
      await new Promise((r) => setTimeout(r, 200))
    }
    await new Promise((r) => setTimeout(r, 5000))
    let sharedList = await ops.getSharedSecrets(realmConfig, identity2)
    expect(sharedList.sharedList[0].data.secretValue).toBe('secret-value')
  })
  it('can create a secret and share it with a username and view Record ', async () => {
    const testName = `test-secret-${uuidv4()}`
    const secret = {
      secretType: 'Credential',
      secretName: testName,
      secretValue: 'this is the one for the share and view record',
      description: 'this is a description',
    }
    const testUsername = username2
    const secretCreated = await ops.createSecret(realmConfig, identity, secret)
    const start = new Date()
    await new Promise((r) => setTimeout(r, 5000))
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
      await new Promise((r) => setTimeout(r, 200))
    }
    await new Promise((r) => setTimeout(r, 5000))
    let sharedList = await ops.getSharedSecrets(realmConfig, identity2)
    expect(sharedList.sharedList[0].data.secretValue).toBe('secret-value')
    let recordView = await ops.viewSecret(
      realmConfig,
      identity2,
      sharedList.sharedList[0].meta.recordId
    )
    expect(sharedList.sharedList[0].meta.recordId).toBe(
      recordView.secret.meta.recordId
    )
  })
  it('can delete a version of an unshared secret', async () => {
    const testName = `test-secret-${uuidv4()}`
    const secret = {
      secretType: 'Credential',
      secretName: testName,
      secretValue: 'secret-value',
      description: 'this is a description',
    }
    const newSecret = {
      secretType: 'Credential',
      secretName: testName,
      secretValue: 'updated-secret-value',
      description: 'this is the updated description',
    }
    await ops.createSecret(realmConfig, identity, secret)
    let secretResp = await ops.updateSecret(
      realmConfig,
      identity,
      secret,
      newSecret
    )
    let deleted = await ops.deleteSecretVersion(
      realmConfig,
      identity,
      secretResp
    )
    expect(deleted.success).toBe(true)
  })
  it('can delete a version of a shared secret', async () => {
    const testName = `test-secret-${uuidv4()}`
    const secret = {
      secretType: 'Client',
      secretName: testName,
      secretValue: `{
        "version": "2",
        "public_signing_key": "A5QXkIKW5dBN_IOhjGoUBtT-xuVmqRXDB2uaqiKuTao",
        "private_signing_key": "qIqG9_81kd2gOY-yggIpahQG1MDnlBeQj7G4MHa5p0E1WapQxLVlyU6hXA6rp-Ci5DFf8g6GMaqy5t_H1g5Nqg",
        "client_id": "4f20ca95-1b3b-b78f-b5bd-6d469ac804eb",
        "api_key_id": "63807026e9a23850307429e52d2f607eaa5be43488cbb819b075ade91735b180",
        "api_secret": "730e6b18dc9668fe1758304283c73060619f6596f11bf42bdd3f16d6fc6cd6d0",
        "public_key": "6u73qLgJniPi9S2t99A7lNfvi3xjxMsPB_Z-CEGWZmo",
        "private_key": "BnBt9_tquBvSAHL04bQm0HkQ7eXtvuj1WSHegQeho6E",
        "api_url": "http://platform.local.tozny.com:8000",
        "client_email": ""
      }`,
      description: 'a client credential secret',
    }
    const testUsername = username2
    const secretCreated = await ops.createSecret(realmConfig, identity, secret)
    const start = new Date()
    await new Promise((r) => setTimeout(r, 5000))
    let shareByUserName
    while (new Date() - start < 30000) {
      shareByUserName = await ops.shareSecretWithUsername(
        realmConfig,
        identity,
        testName,
        'Client',
        testUsername
      )
      if (shareByUserName == secretCreated.meta.type) {
        break
      }
      // delay 200 milliseconds between tries
      await new Promise((r) => setTimeout(r, 200))
    }
    let deleted = await ops.deleteSecretVersion(
      realmConfig,
      identity,
      secretCreated
    )
    expect(deleted.success).toBe(true)
  })
  it('can create a secret and share it with a namespace', async () => {
    const testName = `test-secret-${uuidv4()}`
    const secret = {
      secretType: 'Credential',
      secretName: testName,
      secretValue: 'this is the one for the share with namespace',
      description: 'this is a description',
    }
    const namespace = `mytest-for-namespace${uuidv4()}`
    const testUsername = username2
    await ops.createSecret(realmConfig, identity, secret)
    const start = new Date()
    await new Promise((r) => setTimeout(r, 5000))
    await ops.addSecretToNamespace(
      realmConfig,
      identity,
      secret.secretName,
      secret.secretType,
      namespace
    )
    let addIdentity
    while (new Date() - start < 30000) {
      addIdentity = await ops.addIdentityToNamespace(
        realmConfig,
        identity,
        namespace,
        testUsername
      )
      if (addIdentity === true) {
        break
      }
      // delay 200 milliseconds between tries
      await new Promise((r) => setTimeout(r, 200))
    }
    let sharedList = await ops.getSharedSecrets(realmConfig, identity2)
    expect(sharedList.sharedList[0].data.secretValue).toBe('secret-value')
    let recordView = await ops.viewSecret(
      realmConfig,
      identity2,
      sharedList.sharedList[0].meta.recordId
    )
    expect(sharedList.sharedList[0].meta.recordId).toBe(
      recordView.secret.meta.recordId
    )
  })
  it('can delete all secrets created by an identity', async () => {
    await new Promise((r) => setTimeout(r, 5000))
    let listedSecrets = await ops.getSecrets(realmConfig, identity, 100)
    for (let index = 0; index < listedSecrets.list.length; index++) {
      let deleted = await ops.deleteSecretVersion(
        realmConfig,
        identity,
        listedSecrets.list[index]
      )
      expect(deleted.success).toBe(true)
    }
  })
  // /* These tests are for node only, which means that they will fail the browsers tests on
  //   travis. These will be updated shortly to work with both browser and node. */
  // it('can create a secret with a file type, share and list it', async () => {
  //   const file = fs.createReadStream(fileName, { encoding: 'utf8' })
  //   const testName = `test-secret-${uuidv4()}`
  //   const testUsername = username2
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
  //   let shareByUserName = await ops.shareSecretWithUsername(
  //     realmConfig,
  //     identity,
  //     testName,
  //     'File',
  //     testUsername
  //   )
  //   let sharedList = await ops.getSharedSecrets(realmConfig, identity2)
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
