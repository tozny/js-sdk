const uuidv4 = require('uuid/v4')
const { runInEnvironment, apiUrl, clientRegistrationToken } = global
const Tozny = require('../node')

let writerClient
// let readerClient
// let authorizerClient
beforeAll(async () => {
  writerClient = await registerClient()
  // readerClient = await registerClient()
  // authorizerClient = await registerClient()
})

describe('Tozny', () => {
  it('can register a client', async () => {
    const config = await registerClient('registration-test')
    // Basic exist check to ensure we got back a full Config object.
    expect(config.clientId).toBeTruthy()
    expect(config.apiKeyId).toBeTruthy()
    expect(config.apiSecret).toBeTruthy()
    expect(config.publicKey).toBeTruthy()
    expect(config.privateKey).toBeTruthy()
    expect(config.apiUrl).toBeTruthy()
    expect(config.publicSigningKey).toBeTruthy()
    expect(config.privateSigningKey).toBeTruthy()
  })
  it('can perform CRUD on records', async () => {
    const type = 'say-hello'
    const data = { hello: 'world' }
    const meta = { hola: 'mundo' }
    const record = await writeRecord(writerClient, type, data, meta)
    expect(record).toMatchObject({
      meta: { plain: meta },
      data: data,
    })
    expect(record.meta.recordId).toBeTruthy()
    const read = await readRecord(writerClient, record.meta.recordId)
    expect(read).toMatchObject(record)
  })
})

// Utilities to help with running things in the configured environment

async function registerClient() {
  const name = `integration-client-${uuidv4()}`
  const configJSON = await runInEnvironment(
    function(clientRegistrationToken, apiUrl, name) {
      return Promise.all([
        Tozny.crypto.generateKeypair(),
        Tozny.crypto.generateSigningKeypair(),
      ]).then(function(keys) {
        return Tozny.storage
          .register(
            clientRegistrationToken,
            name,
            keys[0],
            keys[1],
            true,
            apiUrl
          )
          .then(function(info) {
            return new Tozny.storage.Config(
              info.clientId,
              info.apiKeyId,
              info.apiSecret,
              keys[0].publicKey,
              keys[0].privateKey,
              apiUrl,
              keys[1].publicKey,
              keys[1].privateKey
            )
          })
          .then(JSON.stringify)
      })
    },
    clientRegistrationToken,
    apiUrl,
    name
  )
  return JSON.parse(configJSON)
}

async function writeRecord(config, type, data, meta) {
  const recordJSON = await runInEnvironment(
    function(configJSON, type, dataJSON, metaJSON) {
      var config = Tozny.storage.Config.fromObject(configJSON)
      var client = new Tozny.storage.Client(config)
      var data = JSON.parse(dataJSON)
      var meta = JSON.parse(metaJSON)
      return client.writeRecord(type, data, meta).then(JSON.stringify)
    },
    JSON.stringify(config),
    type,
    JSON.stringify(data),
    JSON.stringify(meta)
  )
  return JSON.parse(recordJSON)
}

async function readRecord(config, recordId) {
  const recordJSON = await runInEnvironment(
    function(configJSON, recordId) {
      var config = Tozny.storage.Config.fromObject(configJSON)
      var client = new Tozny.storage.Client(config)
      return client.readRecord(recordId).then(JSON.stringify)
    },
    JSON.stringify(config),
    recordId
  )
  return JSON.parse(recordJSON)
}
