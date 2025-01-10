const { checkStatus,urlEncodeData, validateResponseAsJSON } = require('../utils')

const {
  EAKInfo,
  SignedDocument,
  Note,
  NoteData,
  NoteInfo,
  NoteKeys,
} = require('../../types')

/**
 * Retrieve an access key from the server.
 *
 * @param {Client} client E3DB client instance
 * @param {string} writerId Writer/Authorizer for the access key
 * @param {string} userId   Record subject
 * @param {string} readerId Authorized reader
 * @param {string} type     Record type for which the key will be used
 *
 * @returns {Promise<EAKInfo|null>} Encrypted access key on success, NULL if no key exists.
 */
async function getEncryptedAccessKey(client, writerId, userId, readerId, type) {
  let response = await client.authenticator.tokenFetch(
    client.config.apiUrl +
      '/v1/storage/access_keys/' +
      writerId +
      '/' +
      userId +
      '/' +
      readerId +
      '/' +
      type,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  )
  if (response.status && response.status === 404) {
    return Promise.resolve(null)
  }

  return checkStatus(response)
    .then((response) => response.json())
    .then((eak) => EAKInfo.decode(eak))
}

/**
 * Retrieve an access key from the server.
 *
 * @param {Client} client E3DB client instance
 * @param {string} writerId Writer/Authorizer for the access key
 * @param {string} userId   Record subject
 * @param {string} readerId Authorized reader
 * @param {string} type     Record type for which the key will be used
 *
 * @returns {Promise<string|null>} Decrypted access key on success, NULL if no key exists.
 */
async function getAccessKey(client, writerId, userId, readerId, type) {
  const cacheKey = `${writerId}.${userId}.${type}`
  if (client._akCache[cacheKey] !== undefined) {
    return client._akCache[cacheKey]
  }
  try {
    const eak = await getEncryptedAccessKey(
      client,
      writerId,
      userId,
      readerId,
      type
    )
    if (eak === null) {
      return null
    }
    const key = await client.crypto.decryptEak(client.config.privateKey, eak)
    if (key !== null) {
      // eslint-disable-next-line require-atomic-updates
      client._akCache[cacheKey] = key
    }
    return key
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err)
  }
}

/**
 * Create an access key on the server.
 *
 * @param {Client} client   E3DB client instance
 * @param {string} writerId Writer/Authorizer for the access key
 * @param {string} userId   Record subject
 * @param {string} readerId Authorized reader
 * @param {string} type     Record type for which the key will be used
 * @param {string} ak       Unencrypted access key

 @returns {Promise<string>} Decrypted access key
 */
async function putAccessKey(client, writerId, userId, readerId, type, ak) {
  let clientInfo = await client.clientInfo(readerId)
  let readerKey = clientInfo.publicKey.curve25519
  let eak = await client.crypto.encryptAk(
    client.config.privateKey,
    ak,
    readerKey
  )
  return client.authenticator
    .tokenFetch(
      client.config.apiUrl +
        '/v1/storage/access_keys/' +
        writerId +
        '/' +
        userId +
        '/' +
        readerId +
        '/' +
        type,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ eak: eak }),
      }
    )
    .then(checkStatus)
    .then(() => {
      let cacheKey = `${writerId}.${userId}.${type}`
      client._akCache[cacheKey] = ak

      return Promise.resolve(ak)
    })
}

/**
 * Create an access key for another reader, creating one for this client as needed.
 *
 * @param {Client} client TozStore client instance
 * @param {string} writerId Writer/Authorizer for the access key
 * @param {string} readerId Authorized reader
 * @param {string} type     Record type for which the key will be used
 *
 * @returns {Promise<bool>} Whether the access key was written successfully
 */
async function putAccessKeyForReader(client, writerId, type, readerId) {
  // Get current access key, create one if it is missing
  let clientId = client.config.clientId
  let ak = await getAccessKey(client, writerId, writerId, clientId, type)
  if (ak === null) {
    if (clientId === writerId) {
      ak = await client.crypto.randomKey()
      await putAccessKey(client, clientId, clientId, clientId, type, ak)
    } else {
      throw new Error('Missing access key required for share operation')
    }
  }
  // Create an access key for the new reader
  await putAccessKey(client, writerId, writerId, readerId, type, ak)
}

/**
 * Delete an access key on the server.
 *
 * @param {Client} client   E3DB client instance
 * @param {string} writerId Writer/Authorizer for the access key
 * @param {string} userId   Record subject
 * @param {string} readerId Authorized reader
 * @param {string} type     Record type for which the key will be used
 *
 * @returns {Promise<bool>}
 */
async function deleteAccessKey(client, writerId, userId, readerId, type) {
  let request = await client.authenticator.tokenFetch(
    client.config.apiUrl +
      '/v1/storage/access_keys/' +
      writerId +
      '/' +
      userId +
      '/' +
      readerId +
      '/' +
      type,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  )

  await checkStatus(request)

  let cacheKey = `${writerId}.${userId}.${type}`
  delete client._akCache[cacheKey]

  return true
}

/**
 * Delete an access key on the server.
 *
 * @param {Client} client   E3DB client instance
 * @param {string} writerId Writer/Authorizer for the access key
 * @param {string} userId   Record subject
 * @param {string} readerId Authorized reader
 * @param {string} type     Record type for which the key will be used
 *
 * @returns {Promise<bool>}
 */
async function deleteAccessKeyByReader(client, writerId, userId, readerId, type) {
  let request = await client.authenticator.tokenFetch(
    client.config.apiUrl +
      '/v1/storage/access_keys/reader/' +
      writerId +
      '/' +
      userId +
      '/' +
      readerId +
      '/' +
      type,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  )

  let status =false;
  let response = await checkStatus(request) 
  let cacheKey = `${writerId}.${userId}.${type}`
  delete client._akCache[cacheKey]
  if(response.status === 204){
    status = true
  } 
  return status;
}

/**
 * Add or update an policy to the TozStore storage service
 *
 * @param {Client} client   TozStore Client instance
 * @param {object} policy   An object containing the policy definition to write
 * @param {string} writerId Writer/Authorizer controlling data access
 * @param {string} userId   The client ID of the subject of the protected data
 * @param {string} readerId The client ID whose access is being updated
 * @param {string} type     Record type for which the policy will be used
 *
 * @returns {Promise<bool>} Whether the policy was written successfully
 */
async function putPolicy(client, policy, writerId, userId, readerId, type) {
  let request = await client.authenticator.tokenFetch(
    client.config.apiUrl +
      '/v1/storage/policy/' +
      writerId +
      '/' +
      userId +
      '/' +
      readerId +
      '/' +
      type,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(policy),
    }
  )
  await checkStatus(request)
  return true
}

/**
 * Add or update an policy to the TozStore storage service
 *
 * @param {Client} client   TozStore Client instance
 * @param {object} policy   An object containing the policy definition to write
 * @param {string} writerId Writer/Authorizer controlling data access
 * @param {string} userId   The client ID of the subject of the protected data
 * @param {string} readerId The client ID whose access is being updated
 * @param {string} type     Record type for which the policy will be used
 *
 * @returns {Promise<bool>} Whether the policy was written successfully
 */
async function putPolicyByReader(client, policy, writerId, userId, readerId, type) {
  let request = await client.authenticator.tokenFetch(
    client.config.apiUrl +
      '/v1/storage/policy/reader/' +
      writerId +
      '/' +
      userId +
      '/' +
      readerId +
      '/' +
      type,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(policy),
    }
  )
    let status=false;
    let response = await checkStatus(request)
    if(response.status === 204){
      status = true
    } 
    return status;
 
}

/**
 * Fetch the access key for a record type and use it to decrypt a given record.
 *
 * @param {Client} client E3DB client instance
 * @param {Record} encrypted Record to be decrypted
 *
 * @return {Promise<Record>}
 */
async function decryptRecord(client, encrypted) {
  let ak = await getAccessKey(
    client,
    encrypted.meta.writerId,
    encrypted.meta.userId,
    client.config.clientId,
    encrypted.meta.type
  )
  if (ak === null) {
    throw new Error('No access key available.')
  }

  return client.crypto.decryptRecord(encrypted, ak)
}

/**
 * Fetch the access key for a record type and use it to encrypt a given record.
 *
 * @param {Client} client E3DB client instance
 * @param {Record} record Record to be decrypted
 *
 * @return {Promise<Record>}
 */
async function encryptRecord(client, record) {
  let ak = await getAccessKey(
    client,
    record.meta.writerId,
    record.meta.userId,
    client.config.clientId,
    record.meta.type
  )
  if (ak === null) {
    ak = await client.crypto.randomKey()
    await putAccessKey(
      client,
      record.meta.writerId,
      record.meta.userId,
      client.config.clientId,
      record.meta.type,
      ak
    )
  }
  return client.crypto.encryptRecord(record, ak)
}

/**
 * Verify the signature attached to a specific document.
 *
 * @param {SignedDocument} signed        Document with an attached signature
 * @param {string}         publicSignKey Key to use during signature verification
 *
 * @returns {Promise<bool>}
 */
async function verify(crypto, signed, publicSignKey) {
  let verified = await crypto.verifyDocumentSignature(
    signed.document,
    signed.signature,
    publicSignKey
  )

  return Promise.resolve(verified)
}

async function createEncryptedNote(
  crypto,
  data,
  recipientEncryptionKey,
  recipientSigningKey,
  encryptionKeyPair,
  signingKeyPair,
  options
) {
  const accessKey = await crypto.randomKey()
  const encryptedAccessKey = await crypto.encryptAk(
    encryptionKeyPair.privateKey,
    accessKey,
    recipientEncryptionKey
  )
  let noteData = new NoteData(data)
  let noteKeys = new NoteKeys(
    crypto.mode(),
    recipientSigningKey,
    signingKeyPair.publicKey,
    encryptionKeyPair.publicKey,
    encryptedAccessKey
  )
  var unencryptedNote = new Note(noteData, noteKeys, null, options)
  let encryptedNote = await crypto.encryptNote(
    unencryptedNote,
    accessKey,
    signingKeyPair.privateKey
  )
  if (!encryptedNote.signature) {
    throw new Error('Signature was not attached during encryption')
  }
  return encryptedNote
}

/*
 * Decrypts and validates a note response from TozStore given the proper keys.
 */
async function decryptNoteJson(
  crypto,
  noteJson,
  privateKey,
  publicKey,
  publicSigningKey
) {
  const encryptedNote = Note.decode(noteJson)
  const eak = noteJson.encrypted_access_key
  const ak = await crypto.decryptNoteEak(privateKey, { eak: eak }, publicKey)
  const decryptedNote = await crypto.decryptNote(
    encryptedNote,
    ak,
    publicSigningKey
  )

  if (!decryptedNote.signature) {
    throw new Error('Unable to verify note, no signature attached')
  }
  if (/^[A-Za-z0-9_-]+$/.test(decryptedNote.signature)) {
    let signableNote = NoteInfo.signableSubsetFromNote(decryptedNote)
    let signed = new SignedDocument(signableNote, decryptedNote.signature)
    let verified = await verify(crypto, signed, publicSigningKey)
    if (!verified) {
      throw new Error('Note failed verification')
    }
  }
  return decryptedNote
}

/*
 * InternalWriteNote is an internal method used by writeNote
 */
async function writeNote(
  crypto,
  authenticator,
  data,
  recipientEncryptionKey,
  recipientSigningKey,
  encryptionKeyPair,
  signingKeyPair,
  options,
  apiUrl
) {
  let encryptedNote = await createEncryptedNote(
    crypto,
    data,
    recipientEncryptionKey,
    recipientSigningKey,
    encryptionKeyPair,
    signingKeyPair,
    options
  )
  let response = await authenticator.tsv1Fetch(
    `${apiUrl}/v2/storage/notes`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: encryptedNote.stringify(),
    },
    options.clientId
  )
  let storedNoteResp = await checkStatus(response)
  let noteJson = await storedNoteResp.json()
  // We don't actually have the keys to decrypt this data, but we can show the
  // user the decrypted data as a reference
  let note = Note.decode(noteJson)
  note.data = data
  return note
}

/*
 * InternalReadNote is an internal method used by internalReadNote
 */
async function readNote(
  crypto,
  authenticator,
  encryptionKeyPair,
  requestParams,
  headers,
  apiUrl
) {
  const queryString = Object.entries(requestParams)
    .map((kv) => kv.map(encodeURIComponent).join('='))
    .join('&')
  let request = await authenticator.tsv1Fetch(
    `${apiUrl}/v2/storage/notes?${queryString}`,
    {
      method: 'GET',
      headers,
    }
  )
  let storedNote = await checkStatus(request)
  const noteJson = await storedNote.json()
  // Use this to ensure we referencing the implementing class.
  return decryptNoteJson(
    crypto,
    noteJson,
    encryptionKeyPair.privateKey,
    noteJson.writer_encryption_key,
    noteJson.writer_signing_key
  )
}
/*
 * getNoteViewsleft is an internal method used by index.js's getNoteViewsLeft
 */
async function getNoteViewsLeft(
  authenticator,
  requestParams,
  headers,
  apiUrl
) {
  const queryString = Object.entries(requestParams)
    .map((kv) => kv.map(encodeURIComponent).join('='))
    .join('&')
  let request = await authenticator.tsv1Fetch(
    `${apiUrl}/v2/storage/notes/views?${queryString}`,
    {
      method: 'GET',
      headers,
    }
  )
  let storedViewsLeft = await checkStatus(request)
  const viewsLeftJson = await storedViewsLeft.json()
  return viewsLeftJson;
}

/*
 * InternalDeleteNote is an internal method used by deleteNote
 */
async function deleteNote(authenticator, noteId, apiUrl) {
  let deletedNoteResponse = await authenticator.tsv1Fetch(
    `${apiUrl}/v2/storage/notes/${noteId}`,
    {
      method: 'DELETE',
    }
  )
  checkStatus(deletedNoteResponse)
  return true
}


/*
 * DeleteAllRecordNote is used to delete all notes related to record
 */
async function deleteAllRecordNote(authenticator, recordId, apiUrl) {
  let deletedNoteResponse = await authenticator.tsv1Fetch(
    `${apiUrl}/v2/storage/notes/${recordId}/records`,
    {
      method: 'DELETE',
    }
  )
  checkStatus(deletedNoteResponse)
  return true
}


/*
 * GetAllRecordNotes is used to get all secrets created
 */
async function getAllRecordNotes(authenticator, recordId, apiUrl,nextToken = null, max = null) {

  const urlData = {
    nextToken: nextToken,
    max: max,
  }
  let encodedUrl = urlEncodeData(urlData)
  let noteResponse = await authenticator.tsv1Fetch(
    `${apiUrl}/v2/storage/notes/${recordId}/view?${encodedUrl}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  )
  let response = await checkStatus(noteResponse)
  const result = await response.json()
  return result;
}


/**
 * Issue an EACP challenge for a protected note.
 *
 * @param {Client} client A TozStore client instance.
 * @param {string} key The query string key to use in the request.
 * @param {string} identifier The identifier of the note to issue the challenge for.
 */
async function issueNoteChallenge(client, requestParams, body = {}) {
  if (client.config.version === 1) {
    throw new Error('Cannot read notes without a signing key!')
  }
  const queryString = Object.entries(requestParams)
    .map((kv) => kv.map(encodeURIComponent).join('='))
    .join('&')
  const request = await client.authenticator.tsv1Fetch(
    `${client.config.apiUrl}/v2/storage/notes/challenge?${queryString}`,
    {
      method: 'PATCH',
      'Content-Type': 'application/json',
      body: JSON.stringify(body),
    }
  )
  await checkStatus(request)
  return request.json()
}

/**
 * Add or update an policy to the TozStore storage service
 *
 * @param {Client} client   TozStore Client instance
 * @param {object} policy   An object containing the policy definition to write
 * @param {string} writerId Writer/Authorizer controlling data access
 * @param {string} userId   The client ID of the subject of the protected data
 * @param {string} readerId The client ID whose access is being updated
 *  @param {string} readerId The client ID whose access is being updated

 * @param {string} type     Record type for which the policy will be used
 *
 * @returns {Promise<bool>} Whether the policy was written successfully
 */

async function putPolicyToRecord(
  client,
  policy,
  writerId,
  userId,
  readerId,
  recordId,
  type
) {
  let request = await client.authenticator.tokenFetch(
    client.config.apiUrl +
      '/v1/storage/policy/' +
      writerId +
      '/' +
      userId +
      '/' +
      readerId +
      '/' +
      recordId +
      '/' +
      type,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(policy),
    }
  )
  await checkStatus(request)
  return true
}

async function writeNoteFile(
  authenticator,
  encryptedNote, 
  tempFile,
  fileOps,
  checksum,
  size,
  apiUrl) {
  const pendingResponse = await authenticator.tsv1Fetch(
    `${apiUrl}/v2/storage/notes/files`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: encryptedNote.stringify(),
    }
  )
  const pendingFile = await validateResponseAsJSON(pendingResponse)
  const uploadFile = tempFile.getUploadable()
  await fileOps.upload(pendingFile.file_url, uploadFile, checksum, size)
  tempFile.remove()
  const patchResponse = await authenticator.tsv1Fetch(
    `${apiUrl}/v2/storage/notes/files/${pendingFile.id}`,
    {
      method: 'PATCH',
    }
  )
  await checkStatus(patchResponse)
  return patchResponse.json()
}

async function createEncryptedNoteWithAK(
  crypto,
  data,
  recipientEncryptionKey,
  recipientSigningKey,
  encryptionKeyPair,
  signingKeyPair,
  options,
  accessKey
) {
  
  const encryptedAccessKey = await crypto.encryptAk(
    encryptionKeyPair.privateKey,
    accessKey,
    recipientEncryptionKey
  )
  let noteData = new NoteData(data)
  let noteKeys = new NoteKeys(
    crypto.mode(),
    recipientSigningKey,
    signingKeyPair.publicKey,
    encryptionKeyPair.publicKey,
    encryptedAccessKey
  )
  var unencryptedNote = new Note(noteData, noteKeys, null, options)
  let encryptedNote = await crypto.encryptNote(
    unencryptedNote,
    accessKey,
    signingKeyPair.privateKey
  )
  if (!encryptedNote.signature) {
    throw new Error('Signature was not attached during encryption')
  }
  return encryptedNote
}

module.exports = {
  getEncryptedAccessKey,
  getAccessKey,
  putAccessKey,
  putAccessKeyForReader,
  putPolicyByReader,
  deleteAccessKey,
  deleteAccessKeyByReader,
  putPolicy,
  decryptRecord,
  encryptRecord,
  verify,
  createEncryptedNote,
  decryptNoteJson,
  writeNote,
  readNote,
  getNoteViewsLeft,
  deleteNote,
  issueNoteChallenge,
  putPolicyToRecord,
  createEncryptedNoteWithAK,
  writeNoteFile,
  getAllRecordNotes,
  deleteAllRecordNote
}
