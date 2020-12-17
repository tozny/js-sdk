const { v4: uuidv4 } = require('uuid')
const Tozny = require('../node')
const ops = require('./utils/operations')

// Set really high for slower browser runs.
jest.setTimeout(100000)

let writerClient
let readerClient
let authorizerClient
beforeAll(async () => {
  writerClient = await ops.registerClient()
  readerClient = await ops.registerClient()
  authorizerClient = await ops.registerClient()
})

describe('Tozny', () => {
  it('can register a client', async () => {
    const config = await ops.registerClient('registration-test')
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
    const record = await ops.writeRecord(writerClient, type, data, meta)
    expect(record).toMatchObject(test)
    expect(record.meta.recordId).toBeTruthy()
    const read = await ops.readRecord(writerClient, record.meta.recordId)
    expect(read).toMatchObject(test)
    read.meta.plain = updatedMeta
    read.data = new Tozny.types.RecordData(updatedData)
    const updated = await ops.updateRecord(writerClient, read)
    expect(updated).toMatchObject(updatedTest)
    const readUpdated = await ops.readRecord(writerClient, record.meta.recordId)
    expect(readUpdated).toMatchObject(updatedTest)
    const removed = await ops.deleteRecord(
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
    const shared = await ops.authOperation(
      writerClient,
      'share',
      type,
      readerClient.clientId
    )
    expect(shared).toBe(true)
    const record = await ops.writeRecord(writerClient, type, data, {})
    const read = await ops.readRecord(readerClient, record.meta.recordId)
    expect(read).toMatchObject(test)
    const revoked = await ops.authOperation(
      writerClient,
      'revoke',
      type,
      readerClient.clientId
    )
    expect(revoked).toBe(true)
    expect(ops.readRecord(readerClient, record.meta.recordId)).rejects.toThrow()
  })

  it('allows authorization of record sharing', async () => {
    const type = 'authorized'
    const data = { secret: 'shared with authorized readers' }
    const test = { data }
    const authorized = await ops.authOperation(
      writerClient,
      'addAuthorizer',
      type,
      authorizerClient.clientId
    )
    expect(authorized).toBe(true)
    const record = await ops.writeRecord(writerClient, type, data, {})
    const shared = await ops.authOnBehalfOperation(
      authorizerClient,
      'shareOnBehalfOf',
      type,
      writerClient.clientId,
      readerClient.clientId
    )
    expect(shared).toBe(true)
    const read = await ops.readRecord(readerClient, record.meta.recordId)
    expect(read).toMatchObject(test)
    const revoked = await ops.authOnBehalfOperation(
      authorizerClient,
      'revokeOnBehalfOf',
      type,
      writerClient.clientId,
      readerClient.clientId
    )
    expect(ops.readRecord(readerClient, record.meta.recordId)).rejects.toThrow()
    expect(revoked).toBe(true)
    const deauthorized = await ops.authOperation(
      writerClient,
      'removeAuthorizer',
      type,
      authorizerClient.clientId
    )
    expect(deauthorized).toBe(true)
    expect(
      ops.authOnBehalfOperation(
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
    const written = await ops.writeNote(
      writerClient,
      data,
      readerClient.publicKey,
      readerClient.publicSigningKey,
      options
    )
    expect(written).toMatchObject(writeTest)
    const readById = await ops.readNote(readerClient, written.noteId)
    expect(readById).toMatchObject(readTest)
    const readByName = await ops.readNote(readerClient, noteName, true)
    expect(readByName).toMatchObject(readTest)
    const updated = await ops.replaceNamedNote(
      writerClient,
      updatedData,
      authorizerClient.publicKey,
      authorizerClient.publicSigningKey,
      options
    )
    expect(updated).toMatchObject(updatedWriteTest)
    const updatedRead = await ops.readNote(authorizerClient, updated.noteId)
    expect(updatedRead).toMatchObject(updatedReadTest)
    const deleted = await ops.deleteNote(writerClient, updated.noteId)
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
    const written = await ops.writeAnonymousNote(
      data,
      keyPair.publicKey,
      signingPair.publicKey,
      keyPair,
      signingPair,
      options
    )
    expect(written).toMatchObject(writeTest)
    const read = await ops.readAnonymousNote(
      written.noteId,
      keyPair,
      signingPair
    )
    expect(read).toMatchObject(readTest)
    const deleted = await ops.deleteAnonymousNote(written.noteId, signingPair)
    expect(deleted).toBe(true)
  })
  it('can create groups', async () => {
    const data = { groupName: `testGroup-${uuidv4()}` }
    const createTest = {
      groupName: data.groupName,
      publicKey: writerClient.publicKey,
    }
    const created = await ops.createGroup(
      writerClient,
      data,
      readerClient.publicKey
    )
    expect(created).toMatchObject(createTest)
  })
})
