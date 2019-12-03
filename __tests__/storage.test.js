const uuidv4 = require('uuid/v4')
const { runInEnvironment, apiUrl, clientRegistrationToken } = global
const Tozny = require('../node')

// Set really high for slower browser runs.
jest.setTimeout(100000)

let writerClient
let readerClient
let authorizerClient
beforeAll(async () => {
  writerClient = await registerClient()
  readerClient = await registerClient()
  authorizerClient = await registerClient()
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
    const updatedData = { hello: 'updated' }
    const updatedMeta = { hola: 'updated' }
    const test = {
      meta: { plain: meta },
      data: data,
    }
    const updatedTest = {
      meta: { plain: updatedMeta },
      data: updatedData,
    }
    const record = await writeRecord(writerClient, type, data, meta)
    expect(record).toMatchObject(test)
    expect(record.meta.recordId).toBeTruthy()
    const read = await readRecord(writerClient, record.meta.recordId)
    expect(read).toMatchObject(test)
    read.meta.plain = updatedMeta
    read.data = new Tozny.types.RecordData(updatedData)
    const updated = await updateRecord(writerClient, read)
    expect(updated).toMatchObject(updatedTest)
    const readUpdated = await readRecord(writerClient, record.meta.recordId)
    expect(readUpdated).toMatchObject(updatedTest)
    const removed = await deleteRecord(
      writerClient,
      updated.meta.recordId,
      updated.meta.version
    )
    expect(removed).toBe(true)
  })

  it('allows sharing of records', async () => {
    const type = 'to-share'
    const data = { secret: 'only for special readers' }
    const test = { data }
    const shared = await authOperation(
      writerClient,
      'share',
      type,
      readerClient.clientId
    )
    expect(shared).toBe(true)
    const record = await writeRecord(writerClient, type, data, {})
    const read = await readRecord(readerClient, record.meta.recordId)
    expect(read).toMatchObject(test)
    const revoked = await authOperation(
      writerClient,
      'revoke',
      type,
      readerClient.clientId
    )
    expect(revoked).toBe(true)
    expect(readRecord(readerClient, record.meta.recordId)).rejects.toThrow()
  })

  it('allows authorization of record sharing', async () => {
    const type = 'authorized'
    const data = { secret: 'shared with authorized readers' }
    const test = { data }
    const authorized = await authOperation(
      writerClient,
      'addAuthorizer',
      type,
      authorizerClient.clientId
    )
    expect(authorized).toBe(true)
    const record = await writeRecord(writerClient, type, data, {})
    const shared = await authOnBehalfOperation(
      authorizerClient,
      'shareOnBehalfOf',
      type,
      writerClient.clientId,
      readerClient.clientId
    )
    expect(shared).toBe(true)
    const read = await readRecord(readerClient, record.meta.recordId)
    expect(read).toMatchObject(test)
    const revoked = await authOnBehalfOperation(
      authorizerClient,
      'revokeOnBehalfOf',
      type,
      writerClient.clientId,
      readerClient.clientId
    )
    expect(readRecord(readerClient, record.meta.recordId)).rejects.toThrow()
    expect(revoked).toBe(true)
    const deauthorized = await authOperation(
      writerClient,
      'removeAuthorizer',
      type,
      authorizerClient.clientId
    )
    expect(deauthorized).toBe(true)
    expect(
      authOnBehalfOperation(
        authorizerClient,
        'shareOnBehalfOf',
        type,
        writerClient.clientId,
        readerClient.clientId
      )
    ).rejects.toThrow()
  })

  it('can write, read, update by name, and delete basic notes', async () => {
    const data = { secret: 'data' }
    const updatedData = { secret: 'updated data' }
    const noteName = `globalNoteName-${uuidv4()}`
    const options = { id_string: noteName }
    const writeTest = {
      mode: 'Sodium',
      recipientSigningKey: readerClient.publicSigningKey,
      writerEncryptionKey: writerClient.publicKey,
      writerSigningKey: writerClient.publicSigningKey,
      options: {
        clientId: writerClient.clientId,
        idString: noteName,
      },
    }
    const updatedWriteTest = Object.assign({}, writeTest, {
      recipientSigningKey: authorizerClient.publicSigningKey,
    })
    const readTest = Object.assign({ data }, writeTest)
    const updatedReadTest = Object.assign(
      { data: updatedData },
      updatedWriteTest
    )
    const written = await writeNote(
      writerClient,
      data,
      readerClient.publicKey,
      readerClient.publicSigningKey,
      options
    )
    expect(written).toMatchObject(writeTest)
    const readById = await readNote(readerClient, written.noteId)
    expect(readById).toMatchObject(readTest)
    const readByName = await readNote(readerClient, noteName, true)
    expect(readByName).toMatchObject(readTest)
    const updated = await replaceNamedNote(
      writerClient,
      updatedData,
      authorizerClient.publicKey,
      authorizerClient.publicSigningKey,
      options
    )
    expect(updated).toMatchObject(updatedWriteTest)
    const updatedRead = await readNote(authorizerClient, updated.noteId)
    expect(updatedRead).toMatchObject(updatedReadTest)
    const deleted = await deleteNote(writerClient, updated.noteId)
    expect(deleted).toBe(true)
  })

  it('can write, read, and delete anonymous notes', async () => {
    const data = { secret: 'data' }
    const options = { max_views: 2 }
    const keyPair = await Tozny.crypto.generateKeypair()
    const signingPair = await Tozny.crypto.generateSigningKeypair()
    const writeTest = {
      mode: 'Sodium',
      recipientSigningKey: signingPair.publicKey,
      writerEncryptionKey: keyPair.publicKey,
      writerSigningKey: signingPair.publicKey,
    }
    const readTest = Object.assign({ data }, writeTest)
    const written = await writeAnonymousNote(
      data,
      keyPair.publicKey,
      signingPair.publicKey,
      keyPair,
      signingPair,
      options
    )
    expect(written).toMatchObject(writeTest)
    const read = await readAnonymousNote(written.noteId, keyPair, signingPair)
    expect(read).toMatchObject(readTest)
    const deleted = await deleteAnonymousNote(written.noteId, signingPair)
    expect(deleted).toBe(true)
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
      return client.writeRecord(type, data, meta).then(function(record) {
        return record.stringify()
      })
    },
    JSON.stringify(config),
    type,
    JSON.stringify(data),
    JSON.stringify(meta)
  )
  return Tozny.types.Record.decode(JSON.parse(recordJSON))
}

async function readRecord(config, recordId) {
  const recordJSON = await runInEnvironment(
    function(configJSON, recordId) {
      var config = Tozny.storage.Config.fromObject(configJSON)
      var client = new Tozny.storage.Client(config)
      return client.readRecord(recordId).then(function(record) {
        return record.stringify()
      })
    },
    JSON.stringify(config),
    recordId
  )
  return Tozny.types.Record.decode(JSON.parse(recordJSON))
}

async function updateRecord(config, record) {
  const recordJSON = await runInEnvironment(
    function(configJSON, recordJSON) {
      var config = Tozny.storage.Config.fromObject(configJSON)
      var client = new Tozny.storage.Client(config)
      var recordObj = JSON.parse(recordJSON)
      return Tozny.types.Record.decode(recordObj)
        .then(function(record) {
          return client.updateRecord(record)
        })
        .then(function(record) {
          return record.stringify()
        })
    },
    JSON.stringify(config),
    record.stringify()
  )
  return Tozny.types.Record.decode(JSON.parse(recordJSON))
}

async function deleteRecord(config, recordId, version) {
  const result = await runInEnvironment(
    function(configJSON, recordId, version) {
      var config = Tozny.storage.Config.fromObject(configJSON)
      var client = new Tozny.storage.Client(config)
      return client.deleteRecord(recordId, version).then(JSON.stringify)
    },
    JSON.stringify(config),
    recordId,
    version
  )
  return JSON.parse(result)
}

async function writeNote(
  config,
  data,
  recipientEncryptionKey,
  recipientSigningKey,
  options = {}
) {
  const noteJSON = await runInEnvironment(
    function(
      configJSON,
      dataJSON,
      recipientEncryptionKey,
      recipientSigningKey,
      optionsJSON
    ) {
      var config = Tozny.storage.Config.fromObject(configJSON)
      var client = new Tozny.storage.Client(config)
      var data = JSON.parse(dataJSON)
      var options = JSON.parse(optionsJSON)
      return client
        .writeNote(data, recipientEncryptionKey, recipientSigningKey, options)
        .then(function(note) {
          return note.stringify()
        })
    },
    JSON.stringify(config),
    JSON.stringify(data),
    recipientEncryptionKey,
    recipientSigningKey,
    JSON.stringify(options)
  )
  return Tozny.types.Note.decode(JSON.parse(noteJSON))
}

async function writeAnonymousNote(
  data,
  recipientEncryptionKey,
  recipientSigningKey,
  encryptionKeyPair,
  signingKeyPair,
  options = {}
) {
  const noteJSON = await runInEnvironment(
    function(
      dataJSON,
      recipientEncryptionKey,
      recipientSigningKey,
      encryptionKeyPairJSON,
      signingKeyPairJSON,
      optionsJSON,
      apiUrl
    ) {
      var data = JSON.parse(dataJSON)
      var encryptionKeyPair = JSON.parse(encryptionKeyPairJSON)
      var signingKeyPair = JSON.parse(signingKeyPairJSON)
      var options = JSON.parse(optionsJSON)
      return Tozny.storage
        .writeNote(
          data,
          recipientEncryptionKey,
          recipientSigningKey,
          encryptionKeyPair,
          signingKeyPair,
          options,
          apiUrl
        )
        .then(function(note) {
          return note.stringify()
        })
    },
    JSON.stringify(data),
    recipientEncryptionKey,
    recipientSigningKey,
    JSON.stringify(encryptionKeyPair),
    JSON.stringify(signingKeyPair),
    JSON.stringify(options),
    apiUrl
  )
  return Tozny.types.Note.decode(JSON.parse(noteJSON))
}

async function replaceNamedNote(
  config,
  data,
  recipientEncryptionKey,
  recipientSigningKey,
  options
) {
  const noteJSON = await runInEnvironment(
    function(
      configJSON,
      dataJSON,
      recipientEncryptionKey,
      recipientSigningKey,
      optionsJSON
    ) {
      var config = Tozny.storage.Config.fromObject(configJSON)
      var client = new Tozny.storage.Client(config)
      var data = JSON.parse(dataJSON)
      var options = JSON.parse(optionsJSON)
      return client
        .replaceNoteByName(
          data,
          recipientEncryptionKey,
          recipientSigningKey,
          options
        )
        .then(function(note) {
          return note.stringify()
        })
    },
    JSON.stringify(config),
    JSON.stringify(data),
    recipientEncryptionKey,
    recipientSigningKey,
    JSON.stringify(options)
  )
  return Tozny.types.Note.decode(JSON.parse(noteJSON))
}

async function readNote(config, id, byName = false, authParams = {}) {
  const noteJSON = await runInEnvironment(
    function(configJSON, id, byNameJSON, authParamsJSON) {
      var config = Tozny.storage.Config.fromObject(configJSON)
      var client = new Tozny.storage.Client(config)
      var byName = JSON.parse(byNameJSON)
      var operation = byName ? 'readNoteByName' : 'readNote'
      var authParams = JSON.parse(authParamsJSON)
      return client[operation](id, authParams).then(function(note) {
        return note.stringify()
      })
    },
    JSON.stringify(config),
    id,
    JSON.stringify(byName),
    JSON.stringify(authParams)
  )
  return Tozny.types.Note.decode(JSON.parse(noteJSON))
}

async function readAnonymousNote(
  id,
  encryptionKeyPair,
  signingKeyPair,
  byName = false
) {
  const noteJSON = await runInEnvironment(
    function(
      id,
      encryptionKeyPairJSON,
      signingKeyPairJSON,
      byNameJSON,
      apiUrl
    ) {
      var byName = JSON.parse(byNameJSON)
      var operation = byName ? 'readNoteByName' : 'readNote'
      var encryptionKeyPair = JSON.parse(encryptionKeyPairJSON)
      var signingKeyPair = JSON.parse(signingKeyPairJSON)
      return Tozny.storage[operation](
        id,
        encryptionKeyPair,
        signingKeyPair,
        apiUrl
      ).then(function(note) {
        return note.stringify()
      })
    },
    id,
    JSON.stringify(encryptionKeyPair),
    JSON.stringify(signingKeyPair),
    JSON.stringify(byName),
    apiUrl
  )
  return Tozny.types.Note.decode(JSON.parse(noteJSON))
}

async function deleteNote(config, noteId) {
  const result = await runInEnvironment(
    function(configJSON, noteId) {
      var config = Tozny.storage.Config.fromObject(configJSON)
      var client = new Tozny.storage.Client(config)
      return client.deleteNote(noteId).then(JSON.stringify)
    },
    JSON.stringify(config),
    noteId
  )
  return JSON.parse(result)
}

async function deleteAnonymousNote(noteId, signingKeyPair) {
  const result = await runInEnvironment(
    function(noteId, signingKeyPairJSON, apiUrl) {
      const signingKeyPair = JSON.parse(signingKeyPairJSON)
      return Tozny.storage.deleteNote(noteId, signingKeyPair, apiUrl)
    },
    noteId,
    JSON.stringify(signingKeyPair),
    apiUrl
  )
  return JSON.parse(result)
}

async function authOperation(config, method, type, targetId) {
  const result = await runInEnvironment(
    function(configJSON, method, type, targetId) {
      var config = Tozny.storage.Config.fromObject(configJSON)
      var client = new Tozny.storage.Client(config)
      return client[method](type, targetId).then(JSON.stringify)
    },
    JSON.stringify(config),
    method,
    type,
    targetId
  )
  return JSON.parse(result)
}

async function authOnBehalfOperation(config, method, type, ownerId, targetId) {
  const result = await runInEnvironment(
    function(configJSON, method, type, ownerId, targetId) {
      var config = Tozny.storage.Config.fromObject(configJSON)
      var client = new Tozny.storage.Client(config)
      return client[method](ownerId, type, targetId).then(JSON.stringify)
    },
    JSON.stringify(config),
    method,
    type,
    ownerId,
    targetId
  )
  return JSON.parse(result)
}

// async function infoOperation(config, method) {
//   const result = await runInEnvironment(
//     function(configJSON, method) {
//       var config = Tozny.storage.Config.fromObject(configJSON)
//       var client = new Tozny.storage.Client(config)
//       return client[method]().then(JSON.stringify)
//     },
//     JSON.stringify(config),
//     method
//   )
//   return JSON.parse(result)
// }
