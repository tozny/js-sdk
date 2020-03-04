const Config = require('./config')
const ClientBase = require('./client')
const Crypto = require('../crypto/crypto')
const shared = require('./shared')
const { DEFAULT_API_URL } = require('../utils/constants')
const {
  PublicKey,
  SigningKey,
  ClientDetails,
  NoteOptions,
} = require('../../types')
const fetch = require('isomorphic-fetch')
const { checkStatus } = require('../../lib/utils')
const AuthenticatedRequest = require('../request/authenticatedRequest')

/**
 * The primary storage object, providing registration and client instantiation.
 */
class Storage {
  /**
   * Create an instance of Storage with a specific crypto mode.
   *
   * @param {Crypto} crypto An instance of Crypto for storage use.
   */
  constructor(crypto) {
    if (!(crypto instanceof Crypto)) {
      throw new Error(
        'To create a storage object you must provide a valid crypto instance.'
      )
    }
    this.Client = class Client extends ClientBase {
      static get crypto() {
        return crypto
      }
    }
    this.Config = Config
    this.crypto = crypto
  }

  /**
   * Register a new client with a specific account.
   *
   * @param {string}  registrationToken Registration token as presented by the admin console
   * @param {string}  clientName        Distinguishable name to be used for the token in the console
   * @param {KeyPair} cryptoKeys        Curve25519 key pair used for encryption
   * @param {KeyPair} signingKeys       Ed25519 key pair used for signing
   * @param {bool}    [backup]          Optional flag to automatically back up the newly-created credentials to the account service
   * @param {string}  [apiUrl]          Base URI for the e3DB API
   *
   * @returns {ClientDetails}
   */
  async register(
    registrationToken,
    clientName,
    cryptoKeys,
    signingKeys,
    backup = false,
    apiUrl = DEFAULT_API_URL
  ) {
    /* eslint-disable camelcase */
    let payload
    if (signingKeys) {
      payload = {
        token: registrationToken,
        client: {
          name: clientName,
          public_key: new PublicKey(cryptoKeys.publicKey),
          signing_key: new SigningKey(signingKeys.publicKey),
        },
      }
    } else {
      payload = {
        token: registrationToken,
        client: {
          name: clientName,
          public_key: new PublicKey(cryptoKeys.publicKey),
        },
      }
    }
    /* eslint-enable */
    let backupClientId = false
    let request = await fetch(apiUrl + '/v1/account/e3db/clients/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    let response = await checkStatus(request)
    if (response.headers.has('X-Backup-Client')) {
      backupClientId = response.headers.get('X-Backup-Client')
    }
    let json = await response.json()
    let details = await ClientDetails.decode(json)
    if (backup && backupClientId) {
      if (cryptoKeys.privateKey === null) {
        throw new Error('Cannot back up credentials without a private key!')
      }
      let config = signingKeys
        ? new this.Config(
            details.clientId,
            details.apiKeyId,
            details.apiSecret,
            cryptoKeys.publicKey,
            cryptoKeys.privateKey,
            signingKeys.publicKey,
            signingKeys.privateKey,
            apiUrl
          )
        : new this.Config(
            details.clientId,
            details.apiKeyId,
            details.apiSecret,
            cryptoKeys.publicKey,
            cryptoKeys.privateKey,
            undefined,
            undefined,
            apiUrl
          )
      // Using `this` as the constructor creates an instance of the implementing
      // concrete class rather than the interface
      let client = new this.Client(config)
      await client.backup(backupClientId, registrationToken)
    }

    return Promise.resolve(details)
  }

  /**
   * Proxy to generating a new key pair using the crypto module provided.
   *
   * @returns {KeyPair} Base64URL-encoded representation of the new keypair
   */
  async generateKeypair() {
    return this.crypto.generateKeypair()
  }

  /**
   * Proxy to generating a new signing key pair using the crypto module provided.
   *
   * @returns {KeyPair} Base64URL-encoded representation of the new keypair
   */
  async generateSigningKeypair() {
    return this.crypto.generateSigningKeypair()
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
   * @param {string} recipientSigningKey The public signing key of the reader of this note
   * @param {KeyPair} signingKeyPair Object that has signing public and private keys
   * @param {KeyPair} encryptionKeyPair Object that has encryption public and private keys
   * @param {object} options json hashmap of a NoteOptions object, minus premium features.
   * @param {string} apiUrl Url of the TozStore api that you want to hit (Default is recommended).
   *
   * @returns {Note} A response from TozStore; the note that has been written.
   */
  async writeNote(
    data,
    recipientEncryptionKey,
    recipientSigningKey,
    encryptionKeyPair,
    signingKeyPair,
    options,
    apiUrl = DEFAULT_API_URL
  ) {
    let anonAuth = await AuthenticatedRequest.anonymousAuth(
      this.crypto,
      signingKeyPair.publicKey,
      signingKeyPair.privateKey,
      apiUrl
    )

    // Premium options are not extracted
    /* eslint-disable camelcase */
    var decodedOptions = NoteOptions.decode({
      type: options.type,
      plain: options.plain,
      max_views: options.max_views,
    })
    /* eslint-enable */
    return shared.writeNote(
      this.crypto,
      anonAuth,
      data,
      recipientEncryptionKey,
      recipientSigningKey,
      encryptionKeyPair,
      signingKeyPair,
      decodedOptions,
      apiUrl
    )
  }

  /**
   * ReadNote is a static method used to read a note,
   * allowing you to supply your own signingKey and encryptionKey pairs.
   *
   * @param {string} noteId  UUID assigned by TozStore, used to identify a note.
   * @param {KeyPair} signingKeyPair Object that has signing public and private keys
   * @param {KeyPair} encryptionKeyPair Object that has encryption public and private keys
   * @param {string} apiUrl Url of the TozStore api that you want to hit (Default is recommended).
   *
   * @returns {Note} A note from TozStore unencrypted with the client's keys.
   */
  async readNote(
    noteId,
    encryptionKeyPair,
    signingKeyPair,
    authParams = {},
    authHeaders = {},
    apiUrl = DEFAULT_API_URL
  ) {
    let anonAuth = await AuthenticatedRequest.anonymousAuth(
      this.crypto,
      signingKeyPair.publicKey,
      signingKeyPair.privateKey,
      apiUrl
    )
    // eslint-disable-next-line camelcase
    const params = Object.assign({}, authParams, { note_id: noteId })
    // Use this to ensure we referencing the implementing class.
    return shared.readNote(
      this.crypto,
      anonAuth,
      encryptionKeyPair,
      params,
      authHeaders,
      apiUrl
    )
  }

  /**
   * ReadNoteByName is a static method used to read a note by name,
   * allowing you to supply your own signingKey and encryptionKey pairs.
   *
   * PLEASE NOTE: only notes written by a client, not the static writeNote method,
   * can have a noteName attached.
   *
   * @param {string} noteName  name given to this note with premium features
   * @param {KeyPair} signingKeyPair Object that has signing public and private keys
   * @param {KeyPair} encryptionKeyPair Object that has encryption public and private keys
   * @param {string} apiUrl Url of the TozStore api that you want to hit (Default is recommended).
   *
   * @returns {Note} A note from TozStore unencrypted with the client's keys.
   */
  async readNoteByName(
    noteName,
    encryptionKeyPair,
    signingKeyPair,
    authParams = {},
    authHeaders = {},
    apiUrl = DEFAULT_API_URL
  ) {
    let anonAuth = await AuthenticatedRequest.anonymousAuth(
      this.crypto,
      signingKeyPair.publicKey,
      signingKeyPair.privateKey,
      apiUrl
    )
    // Use this to ensure we referencing the implementing class.
    // eslint-disable-next-line camelcase

    const params = Object.assign({}, authParams, { id_string: noteName })
    return shared.readNote(
      this.crypto,
      anonAuth,
      encryptionKeyPair,
      params,
      authHeaders,
      apiUrl
    )
  }

  /**
   * DeleteNote is a static method that deletes a note from TozStore based on the note identifier,
   * allowing you to supply your own signingKey pair.
   *
   * @param {string} noteId  UUID assigned by TozStore, used to identify a note.
   */
  async deleteNote(noteId, signingKeyPair, apiUrl = DEFAULT_API_URL) {
    let anonAuth = await AuthenticatedRequest.anonymousAuth(
      this.crypto,
      signingKeyPair.publicKey,
      signingKeyPair.privateKey,
      apiUrl
    )
    return shared.deleteNote(anonAuth, noteId, apiUrl)
  }
}

module.exports = Storage
