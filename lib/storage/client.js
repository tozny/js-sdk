const fetch = require('cross-fetch')
const AuthenticatedRequest = require('../request/authenticatedRequest')
const CryptoConsumer = require('../crypto/cryptoConsumer')
const Config = require('./config')
const File = require('./file')
const { urlEncodeData, urlEncodeDataV2 } = require('../utils')
const { checkStatus, validateResponseAsJSON } = require('../utils')
const { DEFAULT_QUERY_COUNT, EMAIL } = require('../utils/constants')
const shared = require('./shared')
const DefaultEncryptionKeyType = 'curve25519'
const {
  AuthorizerPolicy,
  Capabilities,
  ClientInfo,
  Computation,
  EAKInfo,
  FileMeta,
  Group,
  IncomingSharingPolicy,
  Meta,
  OutgoingSharingPolicy,
  Query,
  QueryResult,
  Record,
  RecordData,
  RecordInfo,
  SignedDocument,
  KeyPair,
  Note,
  NoteOptions,
  Search,
  SearchResult,
  GroupMembership,
  Subscription,
} = require('../../types')

/**
 * Core client module used to interact with the Tozny Storage API.
 */
class Client extends CryptoConsumer {
  constructor(config) {
    super()
    if (!(config instanceof Config)) {
      throw new Error('Config must be a valid Config object')
    }
    this.config = config
    this.authenticator = new AuthenticatedRequest(config, this.crypto)
    this._akCache = {}
  }

  /**
   * Implemented in the final client class to provide platform specific file operations.
   *
   * @return {FileOperations} A platform-specific set of file operations.
   */
  get _fileOperations() {
    throw new Error('file operations return a FileOperations instance')
  }

  /**
   * Get an access key from the cache if it exists, otherwise decrypt
   * the provided EAK and populate the cache.
   *
   * @param {string}  writerId
   * @param {string}  userId
   * @param {string}  readerId
   * @param {string}  type
   * @param {EAKInfo} eak
   *
   * @returns {Promise<string>}
   */
  async _getCachedAk(writerId, userId, readerId, type, eak) {
    let cacheKey = `${writerId}.${userId}.${type}`
    let ak = this._akCache[cacheKey]

    if (ak === undefined) {
      ak = await this.crypto.decryptEak(this.config.privateKey, eak)
      this._akCache[cacheKey] = ak
    }

    return Promise.resolve(ak)
  }

  /**
   * Get a client's information based on their ID.
   *
   * @param {string} clientId UUID of the client to fetch
   *
   * @returns {Promise<ClientInfo>}
   */
  async clientInfo(clientId) {
    let request = await this.authenticator.tokenFetch(
      this.config.apiUrl + '/v1/storage/clients/' + clientId,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )

    let response = await checkStatus(request)

    let json = await response.json()
    return ClientInfo.decode(json)
  }

  /**
   * Create a key for the current client as a writer if one does not exist
   * in the cache already. If no access key does exist, create a random one
   * and store it with the server.
   *
   * @param {string} type Record type for this key
   *
   * @returns {Promise<EAKInfo>}
   */
  async createWriterKey(type) {
    let ak = await shared.getAccessKey(
      this,
      this.config.clientId,
      this.config.clientId,
      this.config.clientId,
      type
    )

    if (ak === null) {
      ak = await this.crypto.randomKey()
      await shared.putAccessKey(
        this,
        this.config.clientId,
        this.config.clientId,
        this.config.clientId,
        type,
        ak
      )
    }

    let eak = await this.crypto.encryptAk(
      this.config.privateKey,
      ak,
      this.config.publicKey
    )

    return new EAKInfo(
      eak,
      this.config.clientId,
      this.config.publicKey,
      this.config.clientId,
      this.config.publicSigningKey
    )
  }

  /**
   * Get a key for the current client as the reader of a specific record written by someone else.
   *
   * @param {string} writerId Writer of the record in the database
   * @param {string} userID   Subject of the record in the database
   * @param {string} type     Type of record
   *
   * @returns {Promise<EAKInfo>}
   */
  async getReaderKey(writerId, userId, type) {
    return shared.getEncryptedAccessKey(
      this,
      writerId,
      userId,
      this.config.clientId,
      type
    )
  }

  /**
   * Reads a record from the E3DB system and decrypts it automatically.
   *
   * @param {string} recordId
   * @param {array}  [fields] Optional fields to select on the record
   *
   * @returns {Promise<Record>}
   */
  async readRecord(recordId, fields = null) {
    let path = this.config.apiUrl + '/v1/storage/records/' + recordId

    if (fields !== null) {
      let mapped = []
      for (let field of fields) {
        mapped.push('field=' + field)
      }

      path += '?' + mapped.join('&')
    }

    let request = await this.authenticator.tokenFetch(path, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    let response = await checkStatus(request)
    let json = await response.json()
    let record = await Record.decode(json)
    return shared.decryptRecord(this, record)
  }

  /**
   * Create a new record entry with E3DB.
   *
   * @param {string} type  The content type with which to associate the record.
   * @param {object} data  A hashmap of the data to encrypt and store
   * @param {object} plain Optional hashmap of data to store with the record's meta in plaintext
   *
   * @return {Promise<Record>}
   */
  async writeRecord(type, data, plain = {}) {
    // Build the record
    if (typeof data === 'object' && !(data instanceof RecordData)) {
      data = new RecordData(data)
    }
    let meta = new Meta(this.config.clientId, this.config.clientId, type, plain)
    let info = new RecordInfo(meta, data)
    let signature = this.config.version > 1 ? await this.sign(info) : null
    let record = new Record(meta, data, signature)
    let encrypted = await shared.encryptRecord(this, record)
    const done = await this.writeRaw(encrypted)
    return done
  }

  /**
   * Write a previously stored encrypted/signed record directly to E3DB.
   *
   * @param {Record} record The fully-constructed record object, as returned by `encrypt()`
   *
   * @return {Promise<Record>}
   */
  async writeRaw(record) {
    if (!(record instanceof Record)) {
      throw new Error(
        'Can only write encrypted/signed records directly to the server!'
      )
    }
    let request = await this.authenticator.tokenFetch(
      this.config.apiUrl + '/v1/storage/records',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: record.stringify(),
      }
    )
    let response = await checkStatus(request)
    let json = await response.json()
    let written = await Record.decode(json)
    return shared.decryptRecord(this, written)
  }

  /**
   * Update a record, with optimistic concurrent locking, that already exists in the E3DB system.
   *
   * @param {Record} record Record to be updated.
   *
   * @returns {Promise<Record>} Updated record
   */
  async updateRecord(record) {
    let recordId = record.meta.recordId
    let version = record.meta.version

    // Update record signature
    let recordInfo = new RecordInfo(record.meta, record.data)
    // eslint-disable-next-line require-atomic-updates
    record.signature =
      this.config.version > 1 ? await this.sign(recordInfo) : null
    let encrypted = await shared.encryptRecord(this, record)
    return this.authenticator
      .tokenFetch(
        this.config.apiUrl +
          '/v1/storage/records/safe/' +
          recordId +
          '/' +
          version,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: encrypted.stringify(),
        }
      )
      .then(checkStatus)
      .then((response) => response.json())
      .then(Record.decode)
      .then((rec) => {
        return rec
      })
      .then((record) => shared.decryptRecord(this, record))
  }

  /**
   * Deletes a record from the E3DB system
   *
   * @param {string} recordId  ID of the record to remove
   * @param {string} version version ID to remove safely
   *
   * @returns {Promise<bool>}
   */
  async deleteRecord(recordId, version) {
    const response = await this.authenticator.tokenFetch(
      `${this.config.apiUrl}/v1/storage/records/safe/${recordId}/${version}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
    switch (response.status) {
      case 204:
      case 403:
        return true
      case 409:
        throw new Error('Conflict')
      default:
        throw new Error('Error while deleting record data!')
    }
  }

  /**
   * Creates a new File record in Tozny Storage.
   *
   * @param {string} type The record type for the file.
   * @param {any} handle The platform specific handle to the uploadable file.
   * @param {object} plain The string->string metadata added to the record.
   * @param {object} data (Optional) The string->string data added to the record that gets encrypted.
   * @return {Promise<File>} A promise resolving to the written File object.
   */
  async writeFile(type, handle, plain, data = {}) {
    const { clientId } = this.config
    const ops = this._fileOperations
    ops.validateHandle(handle)
    let ak = await shared.getAccessKey(this, clientId, clientId, clientId, type)
    if (ak === null) {
      ak = await this.crypto.randomKey()
      await shared.putAccessKey(this, clientId, clientId, clientId, type, ak)
    }
    const { size, checksum, tempFile } = await this.crypto.encryptFile(
      handle,
      ak,
      ops
    )
    const meta = new Meta(clientId, clientId, type, plain)
    meta.fileMeta = new FileMeta()
    meta.fileMeta.size = size
    meta.fileMeta.checksum = checksum
    meta.fileMeta.compression = 'raw'
    const signature = await this.sign(new RecordInfo(meta, null))
    let record
    if (data) {
      // Encrypt record data if data is provided
      const plainRecord = new Record(meta, new RecordData(data), signature)
      record = await shared.encryptRecord(this, plainRecord)
      record.meta.fileMeta = meta.fileMeta
    } else {
      record = new Record(meta, new RecordData(), signature)
    }
    const pendingResponse = await this.authenticator.tokenFetch(
      `${this.config.apiUrl}/v1/storage/files`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: record.stringify(),
      }
    )
    const pendingFile = await validateResponseAsJSON(pendingResponse)
    const uploadFile = tempFile.getUploadable()
    await ops.upload(pendingFile.file_url, uploadFile, checksum, size)
    tempFile.remove()
    const finalizeResponse = await this.authenticator.tokenFetch(
      `${this.config.apiUrl}/v1/storage/files/${pendingFile.id}`,
      {
        method: 'PATCH',
      }
    )
    const serializedFileRecord = await validateResponseAsJSON(finalizeResponse)
    const fileRecord = await Record.decode(serializedFileRecord)
    return new File(fileRecord, this, ops)
  }

  /**
   * Transforms a file Record or the ID of a file Record into a File object.
   *
   * @param {Record|string} file Either a file Record or a file record ID.
   */
  getFile(file) {
    const { clientId } = this.config
    const ops = this._fileOperations
    let record
    // If file is just an ID, stub enough to allow operations to occur
    if (!(file instanceof Record)) {
      const meta = new Meta(clientId, clientId, '__', {})
      meta.recordId = file
      meta.fileMeta = new FileMeta()
      record = new Record(meta, null)
    } else {
      record = file
    }
    return new File(record, this, ops)
  }

  /**
   * Encrypt a plaintext record using the AK wrapped and encrypted for the current
   * client. The key will be cached for future use.
   *
   * @param {string}            type  The content type with which to associate the record.
   * @param {RecordData|object} data  A hashmap of the data to encrypt and store
   * @param {object}            eak   Encrypted access key instance
   * @param {object}            plain Optional hashmap of data to store with the record's meta in plaintext
   *
   * @returns {Promise<Record>}
   */
  async localEncrypt(type, data, eak, plain = {}) {
    let ak = await this._getCachedAk(
      this.config.clientId,
      this.config.clientId,
      this.config.clientId,
      type,
      eak
    )

    if (typeof data === 'object' && !(data instanceof RecordData)) {
      data = new RecordData(data)
    }

    // Build the record
    let meta = new Meta(this.config.clientId, this.config.clientId, type, plain)
    let recordInfo = new RecordInfo(meta, data)
    let signature = this.config.version > 1 ? await this.sign(recordInfo) : null
    let record = new Record(meta, data, signature)

    return this.crypto.encryptRecord(record, ak)
  }

  /**
   * Decrypt an encrypted record using the AK wrapped and encrypted for the current
   * client. The key will be cached for future use.
   *
   * @param {Record}  record Record instance with encrypted data for decryption
   * @param {EAKInfo} eak    Encrypted access key instance
   *
   * @returns {Promise<Record>}
   */
  async localDecrypt(record, eak) {
    if (eak.signerSigningKey === null) {
      throw new Error('EAKInfo has no signing key!')
    }

    let ak = await this._getCachedAk(
      record.meta.writerId,
      record.meta.userId,
      this.config.clientId,
      record.meta.type,
      eak
    )

    let decrypted = await this.crypto.decryptRecord(record, ak)
    let info = new RecordInfo(decrypted.meta, decrypted.data)
    let signed = new SignedDocument(info, decrypted.signature)

    // Use this.constructor to ensure the implementing class's crypto is available
    let verify = await this.constructor.verify(
      signed,
      eak.signerSigningKey.ed25519
    )
    if (!verify) {
      throw new Error('Document failed verification')
    }

    return decrypted
  }

  /**
   * Sign a document and return the signature
   *
   * @param {Signable} document Serializable object to be signed.
   *
   * @returns {Promise<string>}
   */
  async sign(document) {
    if (this.config.version === 1) {
      throw new Error('Cannot sign documents without a signing key!')
    }

    return this.crypto.signDocument(document, this.config.privateSigningKey)
  }

  /**
   * Verify the signature attached to a specific document.
   *
   * @param {SignedDocument} signed        Document with an attached signature
   * @param {string}         publicSignKey Key to use during signature verification
   *
   * @returns {Promise<bool>}
   */
  static async verify(signed, publicSignKey) {
    return shared.verify(this.crypto, signed, publicSignKey)
  }

  /**
   * Back up the client's configuration to E3DB in a serialized format that can be read
   * by the Admin Console. The stored configuration will be shared with the specified client,
   * and the account service notified that the sharing has taken place.
   *
   * @param {string} clientId          Unique ID of the client to which we're backing up
   * @param {string} registrationToken Original registration token used to create the client
   *
   * @returns {Promise<bool>}
   */
  async backup(clientId, registrationToken) {
    /* eslint-disable camelcase */
    let credentials = {
      version: '"' + this.config.version.toString() + '"',
      client_id: '"' + this.config.clientId + '"',
      api_key_id: '"' + this.config.apiKeyId + '"',
      api_secret: '"' + this.config.apiSecret + '"',
      client_email: '""',
      public_key: '"' + this.config.publicKey + '"',
      private_key: '"' + this.config.privateKey + '"',
    }
    if (this.config.version === 2) {
      credentials.public_signing_key = '"' + this.config.publicSigningKey + '"'
      credentials.private_signing_key =
        '"' + this.config.privateSigningKey + '"'
    }

    credentials.api_url = '"' + this.config.apiUrl + '"'
    /* eslint-enable */
    await this.writeRecord('tozny.key_backup', credentials, {
      client: this.config.clientId,
    })
    await this.share('tozny.key_backup', clientId)
    await fetch(
      this.config.apiUrl +
        '/v1/account/backup/' +
        registrationToken +
        '/' +
        this.config.clientId,
      {
        method: 'POST',
      }
    )
    return Promise.resolve(true)
  }

  /**
   * Query E3DB records according to a set of selection criteria.
   *
   * The default behavior is to return all records written by the
   * current authenticated client.
   *
   * To restrict the results to a particular type, pass a type or
   * list of types as the `type` argument.
   *
   * To restrict the results to a set of clients, pass a single or
   * list of client IDs as the `writer` argument. To list records
   * written by any client that has shared with the current client,
   * pass the special string 'all' as the `writer` argument.
   *
   * @param {bool}         data     Flag to include data in records
   * @param {string|array} writer   Select records written by a single writer, a list of writers, or 'all'
   * @param {string|array} record   Select a single record or list of records
   * @param {string|array} type     Select records of a single type or a list of types
   * @param {array}        plain    Associative array of plaintext meta to use as a filter
   * @param {number}       pageSize Number of records to fetch per request
   *
   * @returns {QueryResult}
   */
  query(
    data = true,
    writer = null,
    record = null,
    type = null,
    plain = null,
    pageSize = DEFAULT_QUERY_COUNT
  ) {
    let allWriters = false
    if (writer === 'all') {
      allWriters = true
      writer = []
    }

    let query = new Query(
      0,
      data,
      writer,
      record,
      type,
      plain,
      null,
      pageSize,
      allWriters
    )
    return new QueryResult(this, query)
  }

  /**
   * Internal-only method to execute a query against the server and parse the response.
   *
   * @param {Query} query Query request to execute against the server
   *
   * @returns {QueryResult}
   */
  async _query(query) {
    let response = await this.authenticator.tokenFetch(
      this.config.apiUrl + '/v1/storage/search',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: query.stringify(),
      }
    )
    await checkStatus(response)
    return response.json()
  }

  async search(searchRequest) {
    if (!(searchRequest instanceof Search)) {
      throw new Error('A search query must be a Search instance.')
    }

    return new SearchResult(this, searchRequest)
  }

  async _search(searchRequest) {
    const searchBody = searchRequest.stringify()
    let response = await this.authenticator.tokenFetch(
      this.config.apiUrl + '/v2/search',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: searchBody,
      }
    )
    await checkStatus(response)
    return response.json()
  }

  /**
   * Allow another client to grant read access this client's records of a specific type
   *
   * @param {string} type The record type to grant sharing access for
   * @param {string} authorizerId The client ID to grant sharing privileges to
   *
   * @returns {Promise<bool>} Whether the authorizer was added successfully.
   */
  async addAuthorizer(type, authorizerId) {
    const clientId = this.config.clientId
    if (authorizerId === clientId) {
      return true
    }

    await shared.putAccessKeyForReader(this, clientId, type, authorizerId)

    const policy = { allow: [{ authorizer: {} }] }
    return shared.putPolicy(
      this,
      policy,
      clientId,
      clientId,
      authorizerId,
      type
    )
  }

  /**
   * Remove another client's ability to grant read access this client's records of a specific type
   *
   * @param {string} type The record type to revoke sharing access for
   * @param {string} authorizerId The client ID to revoke sharing privileges from
   *
   * @returns {Promise<bool>} Whether the authorizer was removed successfully.
   */
  async removeAuthorizer(type, authorizerId) {
    const clientId = this.config.clientId
    if (authorizerId === clientId) {
      return true
    }

    await shared.deleteAccessKey(this, clientId, clientId, authorizerId, type)

    const policy = { deny: [{ authorizer: {} }] }
    return shared.putPolicy(
      this,
      policy,
      clientId,
      clientId,
      authorizerId,
      type
    )
  }

  /**
   * Grant another E3DB client access to records of a particular type.
   *
   * @param {string} type     Type of records to share
   * @param {string} readerId Client ID or email address of reader to grant access to
   *
   * @returns {Promise<bool>}
   */
  async share(type, readerId) {
    if (EMAIL.test(readerId)) {
      let clientInfo = await this.clientInfo(readerId)
      return this.share(type, clientInfo.clientId)
    }
    // Share on behalf of ourself
    return this.shareOnBehalfOf(this.config.clientId, type, readerId)
  }

  /**
   * Grant another E3DB client access to records of a particular type for a writer.
   *
   * @param {string} writerId Client ID of the writer to grant for
   * @param {string} type     Type of records to share
   * @param {string} readerId Client ID or reader to grant access to
   *
   * @returns {Promise<bool>}
   */
  async shareOnBehalfOf(writerId, type, readerId) {
    // Don't need to share if the reader is the writer
    if (readerId === writerId) {
      return true
    }
    await shared.putAccessKeyForReader(this, writerId, type, readerId)
    const policy = { allow: [{ read: {} }] }
    return shared.putPolicy(this, policy, writerId, writerId, readerId, type)
  }

  /**
   * Revoke another E3DB client's access to records of a particular type.
   *
   * @param {string} type     Type of records to share
   * @param {string} readerId Client ID or email address of reader to grant access from
   *
   * @returns {Promise<bool>}
   */
  async revoke(type, readerId) {
    if (EMAIL.test(readerId)) {
      let clientInfo = await this.clientInfo(readerId)
      return this.revoke(type, clientInfo.clientId)
    }

    // Revoke on behalf of self
    return this.revokeOnBehalfOf(this.config.clientId, type, readerId)
  }

  /**
   * Revoke another E3DB client's access to records of a particular writer and type.
   *
   * @param {string} writerId Client ID of the writer to revoke access to
   * @param {string} type     Type of records to revoke share for
   * @param {string} readerId Client ID of reader to revoke access from
   *
   * @returns {Promise<bool>}
   */
  async revokeOnBehalfOf(writerId, type, readerId) {
    if (readerId === writerId) {
      return true
    }
    // Delete any existing access keys
    await shared.deleteAccessKey(this, writerId, writerId, readerId, type)
    let policy = { deny: [{ read: {} }] }
    return shared.putPolicy(this, policy, writerId, writerId, readerId, type)
  }

  /**
   * Get a list of all outgoing sharing policy relationships
   *
   * @returns {Promise<array>}
   */
  async outgoingSharing() {
    let request = await this.authenticator.tokenFetch(
      this.config.apiUrl + '/v1/storage/policy/outgoing',
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
    let response = await checkStatus(request)
    let json = await response.json()

    return Promise.all(json.map(OutgoingSharingPolicy.decode))
  }

  /**
   * Get a list of all incoming sharing policy relationships
   *
   * @returns {Promise<array>}
   */
  async incomingSharing() {
    let request = await this.authenticator.tokenFetch(
      this.config.apiUrl + '/v1/storage/policy/incoming',
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
    let response = await checkStatus(request)
    let json = await response.json()

    return Promise.all(json.map(IncomingSharingPolicy.decode))
  }

  async getAuthorizers() {
    const request = await this.authenticator.tokenFetch(
      this.config.apiUrl + '/v1/storage/policy/proxies',
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
    const response = await checkStatus(request)
    const proxies = await response.json()

    return proxies.map(AuthorizerPolicy.decode)
  }

  async getAuthorizedBy() {
    const request = await this.authenticator.tokenFetch(
      this.config.apiUrl + '/v1/storage/policy/granted',
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
    const response = await checkStatus(request)
    const granted = await response.json()

    return granted.map(AuthorizerPolicy.decode)
  }

  /**
   * WriteNote is a static method that encrypts a note and sends it to TozStore,
   * allowing you to supply your own signingKey and encryptionKey pairs.
   *
   * Using this method you are not allowed to provide premium options to TozStore,
   * such as additional views, extended expiration time, etc.
   *
   * @param {object} data  A hashmap of the data to encrypt and store
   * @param {string} recipientEncryptionKey The public encryption key of the reader of this note
   * @param {string} recipientSigningKey signing key of the reader of this note
   * @param {object} options json hashmap of a NoteOptions object.
   *
   * @returns {Note} A response from TozStore; the note that has been written.
   */
  async writeNote(data, recipientEncryptionKey, recipientSigningKey, options) {
    // This method requires an instantiated client, and thus by default it will be a premium note written by an identifiable client,
    // so we automatically mix in the client id unless it is overridden in the provided options.
    /* eslint-disable camelcase */
    const decodedOptions = NoteOptions.decode(
      Object.assign({ client_id: this.config.clientId }, options)
    )
    /* eslint-enable */
    const encryptionKeys = new KeyPair(
      this.config.publicKey,
      this.config.privateKey
    )
    let signingKeys = new KeyPair(
      this.config.publicSigningKey,
      this.config.privateSigningKey
    )
    return shared.writeNote(
      this.crypto,
      this.authenticator,
      data,
      recipientEncryptionKey,
      recipientSigningKey,
      encryptionKeys,
      signingKeys,
      decodedOptions,
      this.config.apiUrl
    )
  }

  /**
   * Remove and re-insert a new note with the same name as the old one.
   *
   * Named notes are useful due to the fact the name is user determined, However,
   * sometime you need to update the data stored at that name. This is a problem
   * since notes are immutable. This method allows the old note to be removed
   * and a new named note written into its place in a single transaction, which
   * is rolled back if there are issues. This is much safer than performing the
   * two transactions individually.
   *
   * @param {Object} data The data to include in the replace note
   * @param {string} recipientEncryptionKey The public encryption key of the reader of this note
   * @param {string} recipientSigningKey The public signing key of the reader of this note
   * @param {Object} options json hashmap of a NoteOptions object
   *
   * @return {Note} The replaced note written to TozStore.
   */
  async replaceNoteByName(
    data,
    recipientEncryptionKey,
    recipientSigningKey,
    options
  ) {
    // This method requires an instantiated client, and thus by default it will be a premium note written by an identifiable client,
    // so we automatically mix in the client id unless it is overridden in the provided options.
    /* eslint-disable camelcase */
    const decodedOptions = NoteOptions.decode(
      Object.assign({ client_id: this.config.clientId }, options)
    )
    const encryptionKeys = new KeyPair(
      this.config.publicKey,
      this.config.privateKey
    )
    let signingKeys = new KeyPair(
      this.config.publicSigningKey,
      this.config.privateSigningKey
    )
    let encryptedNote = await shared.createEncryptedNote(
      this.crypto,
      data,
      recipientEncryptionKey,
      recipientSigningKey,
      encryptionKeys,
      signingKeys,
      decodedOptions
    )
    let response = await this.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v2/storage/notes`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: encryptedNote.stringify(),
      },
      options.clientId
    )
    let storedNoteResp = await checkStatus(response)
    let noteJson = await storedNoteResp.json()
    return Note.decode(noteJson)
  }

  /**
   * ReadNote makes call to TozStore to read note by noteId (uuid).
   *
   * @param {string} noteId  UUID assigned by TozStore, used to identify a note.
   * @param {Object} authParams Extra request parameters for EACP authorizations.
   *
   * @returns {Note} A note from TozStore unencrypted with the client's keys.
   */
  async readNote(noteId, authParams = {}, authHeaders = {}) {
    if (this.config.version === 1) {
      throw new Error('Cannot read notes without a signing key!')
    }
    let encryptionKeys = new KeyPair(
      this.config.publicKey,
      this.config.privateKey
    )
    // eslint-disable-next-line camelcase
    const params = Object.assign(authParams, { note_id: noteId })
    // Use this.constructor to ensure we referencing the implementing class.
    return shared.readNote(
      this.crypto,
      this.authenticator,
      encryptionKeys,
      params,
      authHeaders,
      this.config.apiUrl
    )
  }

  /**
   * ReadNoteByName makes call to TozStore to read note by user defined id_string.
   * Only premium notes can define this id string or name.
   *
   * @param {string} noteName  name given to this note with premium features
   * @param {Object} authParams Extra request parameters for EACP authorizations.
   *
   * @returns {Note} A note from TozStore unencrypted with the client's keys.
   */
  async readNoteByName(noteName, authParams = {}, authHeaders = {}) {
    if (this.config.version === 1) {
      throw new Error('Cannot read notes without a signing key!')
    }
    let encryptionKeys = new KeyPair(
      this.config.publicKey,
      this.config.privateKey
    )
    // eslint-disable-next-line camelcase
    const params = Object.assign(authParams, { id_string: noteName })
    // Use this.constructor to ensure we referencing the implementing class.
    return shared.readNote(
      this.crypto,
      this.authenticator,
      encryptionKeys,
      params,
      authHeaders,
      this.config.apiUrl
    )
  }

  /**
   * DeleteNote deletes a note from TozStore based on the note identifier.
   *
   * @param {string} noteId  UUID assigned by TozStore, used to identify a note.
   */
  async deleteNote(noteId) {
    if (this.config.version === 1) {
      throw new Error('Cannot delete notes without a signing key!')
    }
    // Use this.constructor to ensure we referencing the implementing class.
    return shared.deleteNote(this.authenticator, noteId, this.config.apiUrl)
  }

  /**
   * Issue an EACP challenge for a note identified by note ID.
   *
   * A note with an EACP will sometimes require issuing a challenge before the
   * note can be read. This will issue that challenge when the note ID is
   * known. This feature is only available for full clients.
   *
   * @param {string} noteId The UUID of the note to issue the challenge for
   * @param {Object} meta Metadata to send as the body of the challenge request
   *
   * @return {Array.<string>} An array of strings for challenges issued
   */
  async noteChallenge(noteId, meta = {}) {
    // eslint-disable-next-line camelcase
    const params = { note_id: noteId }
    return shared.issueNoteChallenge(this, params, meta)
  }

  /**
   * Issue an EACP challenge for a note identified by name.
   *
   * A note with an EACP will sometimes require issuing a challenge before the
   * note can be read. This will issue that challenge when the note name is
   * known. This feature is only available for full clients.
   *
   * @param {string} noteName The name of the note to issue the challenge for
   * @param {Object} meta Metadata to send as the body of the challenge request
   *
   * @return {Array.<string>} An array of strings for challenges issued
   */
  async noteChallengeByName(noteName, meta = {}) {
    // eslint-disable-next-line camelcase
    const params = { id_string: noteName }
    return shared.issueNoteChallenge(this, params, meta)
  }

  /**
   * createGroup creates a group and sends it to TozStore.
   *
   * @param {string} name  the name of the group
   * @param {array} capabilities an array of strings of the capabilities the group will have
   * @param {string} description  details about the group
   *
   * @returns {Group} A response from TozStore; the group that has been written.
   */
  async createGroup(name, capabilities = [], description) {
    const encryptionKeyPair = new KeyPair(
      this.config.publicKey,
      this.config.privateKey
    )
    const groupKeyPair = await this.crypto.generateKeypair()
    const pk = await this.crypto.encryptPrivateKey(
      groupKeyPair.privateKey,
      encryptionKeyPair.privateKey,
      encryptionKeyPair.publicKey
    )
    const capabilitiesArray = Capabilities.toArray(capabilities)
    let createGroupReq = {
      group_name: name,
      public_key: groupKeyPair.publicKey,
      capabilities: capabilitiesArray,
      encrypted_group_key: pk,
      description: description,
    }
    const createGroupReqKeys = Object.keys(createGroupReq)
    for (const key of createGroupReqKeys) {
      if (createGroupReq[key] === null || createGroupReq[key] === []) {
        delete createGroupReq[key]
      }
    }
    let response = await this.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v2/storage/groups`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(createGroupReq),
      }
    )
    const groupJson = await validateResponseAsJSON(response)
    const group = Group.decode(groupJson)
    const groupMembership = new GroupMembership(null, group, capabilitiesArray)
    return groupMembership
  }
  /**
   * Delete the group with the specific group_id.
   * @param {string} groupID  ID of the group to delete
   *
   * @returns {Promise<bool>}
   */
  async deleteGroup(groupID) {
    const response = await this.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v2/storage/groups/${groupID}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
    switch (response.status) {
      case 204:
        return true
      case 403:
        throw new Error('Unauthorized')
      default:
        throw new Error('Error while deleting record data.')
    }
  }

  /**
   * ReadGroup makes call to TozStore to read group by groupId (uuid).
   *
   * @param {string} groupId  UUID assigned by TozStore, used to identify a group.
   *
   * @returns {Group} A group from TozStore.
   */
  async readGroup(groupID) {
    let response = await this.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v2/storage/groups/${groupID}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
    let groupJson = await validateResponseAsJSON(response)
    let group = Group.decode(groupJson)
    return group
  }

  /**
   *
   * @param {string} clientID   UUID assigned by TozStore, used to identify the client; optional.
   * @param {Array} groupNames  Array of string group names to filter responses by; optional.
   * @param {number} nextToken  Indicates where to start pagination; optional.
   * @param {number} max        The maximum number of groups to list per request; optional.
   *
   * @return {Array}  An array of groups returned from TozStore.
   */
  async listGroups(
    clientID = null,
    groupNames = [],
    nextToken = null,
    max = null
  ) {
    const urlData = {
      client_id: clientID,
      nextToken: nextToken,
      max: max,
    }
    let encodedUrl = urlEncodeData(urlData)
    groupNames.forEach((name) => {
      let current = 'group_names=' + name
      if (encodedUrl === '') {
        encodedUrl = current
      } else {
        encodedUrl += '&' + current
      }
    })
    let response = await this.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v2/storage/groups?${encodedUrl}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
    let groupsJson = await validateResponseAsJSON(response)
    let listGroups = []
    groupsJson.groups.forEach((group) => {
      listGroups.push(Group.decode(group))
    })
    const returnValues = {
      groups: listGroups,
      nextToken: groupsJson.next_token,
    }
    return returnValues
  }
  /**
   *
   * @param {string} clientID   UUID assigned by TozStore, used to identify the client; optional.
   * @param {String} groupName Group name you want to get information regarding.
   *
   * @return {Object}  The group object or null if it does not exist.
   */
  async groupInfo(groupName, clientID = null) {
    const urlData = {
      client_id: clientID,
      group_names: groupName,
    }
    let encodedUrl = urlEncodeData(urlData)

    let response = await this.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v2/storage/groups?${encodedUrl}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
    let groupsJson = await validateResponseAsJSON(response)
    const finalGroup = groupsJson.groups.find((g) => g.group_name == groupName)
    if (!finalGroup) {
      return {}
    }
    return Group.decode(finalGroup)
  }

  /**
   * addGroupMembers adds members to the TozStore Group given.
   *
   * @param {string} groupId  UUID assigned by TozStore, used to identify a group.
   * @param {GroupMember[]} groupMembers wraps together the ClientID, Capability and Membership Key for each client being added to the group
   *
   *
   * @returns {GroupMember} A response from TozStore; the group members who have been added.
   *
   */
  async addGroupMembers(groupId, groupMembers = []) {
    // Get Group Membership key for current client
    let membershipResponse = await this.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v2/storage/groups/${groupId}/membership_key`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
    let groupMembershipJson = await validateResponseAsJSON(membershipResponse)
    // Get the public key for the authorizer, in order to unwrap the encrypted group key
    // of the client adding these members
    let publicKeysAuthResp = await this.authenticator.tokenFetch(
      `${this.config.apiUrl}/v1/client/${groupMembershipJson.authorizer_id}/public`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
    let publicKeysAuthJSON = await validateResponseAsJSON(publicKeysAuthResp)
    // Get All members Public Keys to create their membership keys
    let clientIDs = []
    groupMembers.forEach((member) => {
      clientIDs.push(member.clientID)
    })
    // Create the API object
    let groupMembersPublicKeysRequest = {
      client_ids: clientIDs,
    }
    let publicKeysResponse = await this.authenticator.tokenFetch(
      `${this.config.apiUrl}/v1/client/public`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(groupMembersPublicKeysRequest),
      }
    )
    let publicKeysJSON = await validateResponseAsJSON(publicKeysResponse)
    // Create the new membership key
    for (var i = 0; i < groupMembers.length; i++) {
      let newMembershipKey = await this.crypto.createGroupMembershipKey(
        this.config.privateKey,
        groupMembershipJson.encrypted_membership_key,
        publicKeysJSON.clients[groupMembers[i].clientID].public_key[
          DefaultEncryptionKeyType
        ],
        publicKeysAuthJSON.public_key[DefaultEncryptionKeyType]
      )
      groupMembers[i].membershipKey = newMembershipKey
    }
    // Take the Given Paramaters and create the object needed for endpoint
    let groupMembersToAdd = []
    groupMembers.forEach((member) => {
      groupMembersToAdd.push({
        client_id: member.clientID,
        membership_key: member.membershipKey,
        capability_names: member.capabilities,
      })
    })
    let addGroupMembersRequest = {
      group_id: groupId,
      group_members: groupMembersToAdd,
    }
    // Call the API endpoint to add group members
    let response = await this.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v2/storage/groups/${groupId}/members`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(addGroupMembersRequest),
      }
    )
    // Await the Response from the API with the Added Group member Response
    let groupMembersJson = await validateResponseAsJSON(response)
    let listGroupMembers = []
    groupMembersJson.forEach((member) => {
      listGroupMembers.push(member)
    })
    return listGroupMembers
  }

  /**
   * removeGroupMembers removes members to the TozStore Group given.
   *
   * @param {string} groupId  UUID assigned by TozStore, used to identify a group.
   * @param {Array} clientIds all the clientIDs corresponding to the group members you want to remove
   *
   *
   * @returns {Promise<bool>}
   *
   */
  async removeGroupMembers(groupId, clientIds = []) {
    // Take the Given Paramaters and create the object needed for endpoint
    let groupMemberToRemove = []
    clientIds.forEach((client) => {
      groupMemberToRemove.push({
        client_id: client,
      })
    })
    let removeGroupMembersRequest = {
      group_id: groupId,
      group_members: groupMemberToRemove,
    }
    // Call the API endpoint to remove group members
    let response = await this.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v2/storage/groups/${groupId}/members`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(removeGroupMembersRequest),
      }
    )
    // Check the response code
    switch (response.status) {
      case 204:
        return true
      case 403:
        throw new Error('Unauthorized')
      default:
        throw new Error('Error while removing group members.')
    }
  }
  /**
   * listGroupMembers lists members of the TozStore Group given.
   *
   * @param {string} groupId  UUID assigned by TozStore, used to identify a group.
   *
   * @returns {GroupMember[]} A response from TozStore; the group members of the group.
   */
  async listGroupMembers(groupId) {
    // Call the API endpoint to remove group members
    let response = await this.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v2/storage/groups/${groupId}/members`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
    let groupMembersJson = await validateResponseAsJSON(response)
    return groupMembersJson
  }
  /**
   * bulkListGroupMembers lists members of a given set of TozStore groups.
   *
   * @param {string} groupIds  UUIDs assigned by TozStore, used to identify a group.
   *
   * @returns {[]{string, GroupMember[]}} A map of groupIDs to a list of members in that group.
   */
  async bulkListGroupMembers(groupIds) {
    console.log('in client.bulkListGroupMembers')
    const listGroupMembersRequest = {
      group_ids: groupIds,
    }
    let encodedUrl = urlEncodeDataV2(listGroupMembersRequest)
    console.log(`client.bulkListGroupMembers encodedURL = ${encodedUrl}`)
    // Call the API endpoint to remove group members
    let response = await this.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v2/storage/groups/bulk/members?${encodedUrl}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
    console.log(`client.bulkListGroupMembers response = ${response}`)
    let groupMembersJson = await validateResponseAsJSON(response)
    return groupMembersJson.results
  }
  /**
   * listRecordsSharedWithGroup
   *
   * @param {string} groupId   UUID assigned by TozStore, used to identify a group.
   * @param {Array} writerIds  Array of writerIds to filter responses by; optional.
   * @param {number} nextToken  Indicates where to start pagination; optional.
   * @param {number} max        The maximum number of groups to list per request; optional.
   *
   * @return {Array}  An array of records returned from TozStore.
   */
  async listRecordsSharedWithGroup(
    groupId,
    writerIds = [],
    nextToken = null,
    max = null
  ) {
    console.log(writerIds)
    // Create a search query
    const groupIds = [groupId]
    const searchRequest = new Search(true, true, max, nextToken, groupIds, true)
    // Create search result
    const resultQuery = await this.search(searchRequest)
    // Execute search
    let resultList = await resultQuery.next(true)
    if (resultList.length == 0) return []
    return [resultList, { nextToken: resultQuery.request.nextToken }]
  }

  /**
   * bulkListRecordsSharedWithGroup
   *
   * @param {string} groupIds   UUIDs assigned by TozStore, used to identify a group.
   * @param {number} nextToken  Indicates where to start pagination; optional.
   * @param {number} max        The maximum number of records to list per request; optional.
   *
   * @return {Array}  An array of records returned from TozStore and their corresponding group.
   */
  async bulkListRecordsSharedWithGroup(groupIds, nextToken = '', max = 100) {
    const listSharedRequest = {
      group_ids: groupIds,
      next_token: nextToken,
      max: max,
    }

    let encodedUrl = urlEncodeDataV2(listSharedRequest)
    let response = await this.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v2/storage/groups/bulk/share?${encodedUrl}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )

    let recordsJson = await validateResponseAsJSON(response)

    if (recordsJson.results == null) {
      return {
        nextToken: null,
        records: [],
      }
    }

    let groupRecords = []
    for (const [groupID, records] of Object.entries(recordsJson.results)) {
      let listSharedWithGroups = []

      if (records) {
        for (var i = 0; i < records.length; i++) {
          let meta = await Meta.decode(records[i].meta)
          let recordData = await new RecordData(records[i].record_data)
          let record = await new Record(meta, recordData, records[i].rec_sig)
          // Note: When fetching group records, particularly for the files use-case
          // using the cached AK gives us the benefit of placing the AK in the cache
          // which means later when downloading the file, the AK does not need to
          // be fetched from the API. The gotcha here for now is that the API does
          // not currently support AK fetches when access is granted via group
          // permissions. This hides that by making sure the direct fetch is not
          // needed, however for it to work the group records must be fetched via
          // this list method first. This method is currently the only viable way
          // of reading records that have been shared via the groups API.
          let ak = await this._getCachedAk(
            meta.writerId,
            meta.userId,
            this.config.clientId,
            meta.type,
            records[i].group_access_key
          )
          let decryptedRecord = await this.crypto.decryptRecord(record, ak)
          listSharedWithGroups.push(decryptedRecord)
        }
      }

      groupRecords.push({ groupID: groupID, records: listSharedWithGroups })
    }

    return {
      nextToken: recordsJson.next_token,
      records: groupRecords,
    }
  }

  /**
   * shareRecordWithGroup
   *
   * @param {string} groupId   UUID assigned by TozStore, used to identify a group.
   * @param {string} recordType Record type to be shared with the group.
   *
   * @return {Promise<Record>}
   */
  async shareRecordWithGroup(groupId, recordType) {
    // Get the Groups Public key
    let groupInfo = await this.readGroup(groupId)
    // Get the access Key
    let accessKey = await shared.getAccessKey(
      this,
      this.config.clientId,
      this.config.clientId,
      this.config.clientId,
      recordType
    )
    //create group access key
    let groupEAK = await this.crypto.createGroupAccessKey(
      groupInfo.publicKey,
      accessKey,
      this.config.privateKey
    )
    // Share with group
    const shareRecordRequest = {
      group_id: groupId,
      record_type: recordType,
      encrypted_access_key: groupEAK,
      public_key: groupInfo.publicKey,
    }
    let response = await this.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v2/storage/groups/${groupId}/share`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(shareRecordRequest),
      }
    )
    return await validateResponseAsJSON(response)
  }

  /**
   * revokeRecordWithGroup
   *
   * @param {string} groupId   UUID assigned by TozStore, used to identify a group.
   * @param {string} recordType Record type to be unshared with the group.
   *
   *
   */
  async revokeRecordWithGroup(groupId, recordType) {
    const removeRecordSharedWithGroupRequest = {
      record_type: recordType,
    }
    let response = await this.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v2/storage/groups/${groupId}/share`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(removeRecordSharedWithGroupRequest),
      }
    )
    // Check the response code

    switch (response.status) {
      case 204:
        return true
      case 401:
        throw new Error('Unauthorized')
      default:
        throw new Error(
          `Error while unsharing record with group, Error: ${response.status}`
        )
    }
  }

  /**
   * fetchSubscriptionsToComputations fetches all Computations the TozStore Client is registered for
   */
  async fetchSubscriptionsToComputations(subscription) {
    const request = await this.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v1/secure-compute/subscription?client_id=${subscription.ToznyClientID}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
    let response = await checkStatus(request)
    let json = await response.json()
    return Computation.decode(json)
  }

  /**
   * fetchAvailableCOmputations fetches all available computations to the TozStore Client
   */
  async fetchAvailableComputations() {
    const request = await this.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v1/secure-compute/compute`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
    let response = await checkStatus(request)
    let json = await response.json()
    return Computation.decode(json)
  }

  /**
   * computeAnalysis runs a computation for a subscribed TozStore Client
   */
  async computeAnalysis(params) {
    const computeEncoded = {
      tozny_client_id: params.ToznyClientID,
      data_start_timestamp: params.DataStartTimestamp,
    }
    if (typeof params.DataEndTimestamp !== 'undefined') {
      computeEncoded['data_end_timestamp'] = params.DataEndTimestamp
    }
    if (typeof params.DataRequired !== 'undefined') {
      let obj = Object.fromEntries(params.DataRequired)
      computeEncoded['data_required'] = obj
    }
    let dataRequest = JSON.stringify(computeEncoded).replace(/\\/g, '')
    const request = await this.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v1/secure-compute/compute/${params.ComputationID}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: dataRequest,
      }
    )
    let response = await checkStatus(request)
    let json = await response.json()
    return Computation.decode(json)
  }
  /**
   * subscribeToComputation allows a TozStore Client to subscribe to an available
   * computation for their data
   */
  async subscribeToComputation(subscription) {
    let managerArray = []
    if (typeof subscription.SubscriptionManagers !== 'undefined') {
      for (let i = 0; i < subscription.SubscriptionManagers.length; i++) {
        managerArray.push({
          tozny_client_id: subscription.SubscriptionManagers[i],
        })
      }
    }
    const subscriptionEncoded = {
      tozny_client_id: subscription.ToznyClientID,
      computation_id: subscription.ComputationID,
      subscription_managers: managerArray,
    }
    const request = await this.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v1/secure-compute/subscription`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(subscriptionEncoded),
      }
    )
    let response = await checkStatus(request)
    let json = await response.json()
    return Subscription.decode(json)
  }

  /**
   * unsubscribeFromComputation ends the subscription for a TozStore Client from a computation
   */
  async unsubscribeFromComputation(unsubscribeParams) {
    const response = await this.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v1/secure-compute/subscription?client_id=${unsubscribeParams.ToznyClientID}&computation_id=${unsubscribeParams.ComputationID}`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
    switch (response.status) {
      case 201:
        return true
      case 401:
        throw new Error('Unauthorized')
      case 404:
        throw new Error('Computation not found')
      default:
        throw new Error('Error while unsubscribing from computation.')
    }
  }

  /**
   * updateSubscriptionToComputation updates information on a subscribed computation
   */
  async updateSubscriptionToComputation(updateSubscription) {
    let managerArray = []
    if (typeof updateSubscription.SubscriptionManagers !== 'undefined') {
      for (let i = 0; i < updateSubscription.SubscriptionManagers.length; i++) {
        managerArray.push({
          tozny_client_id: updateSubscription.SubscriptionManagers[i],
        })
      }
    }
    const updateSubscriptionRequest = {
      computation_id: updateSubscription.ComputationID,
      subscription_managers: managerArray,
    }
    const response = await this.authenticator.tsv1Fetch(
      `${this.config.apiUrl}/v1/secure-compute/subscription`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateSubscriptionRequest),
      }
    )
    switch (response.status) {
      case 201:
        return true
      case 403:
        throw new Error('Unauthorized')
      case 404:
        throw new Error('No subscription found')
      default:
        throw new Error('Error while updating subscription.')
    }
  }
}

module.exports = Client
