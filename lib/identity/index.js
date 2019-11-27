const Client = require('./client')
const Config = require('./config')
const fetch = require('isomorphic-fetch')
const { validateResponseAsJSON, trimSlash, checkStatus } = require('../utils')
const { deriveNoteCreds } = require('../utils/credentials')
const CryptoConsumer = require('../crypto/cryptoConsumer')
const Crypto = require('../crypto/crypto')
const StorageConfig = require('../storage/config')
const { PublicKey, SigningKey } = require('../types')

module.exports = Identity

/**
 * Identity represents a connection to the Tozny Identity service on behalf of a realm.
 *
 * Before registration, login, or other client creation methods are possible, the configuration
 * for a Tozny Identity realm is needed. Identity holds this configuration and provides methods
 * for all pre-client operations. In other words, the methods this object make identity clients
 * for users that belong to the configured realm. It helps authenticate users.
 */
class Identity extends CryptoConsumer {
  static configure(crypto, Storage) {
    if (!(crypto instanceof Crypto)) {
      throw new Error(
        `Identity configurations requires a valid instance of Crypto`
      )
    }
    if (Storage) {
      throw new Error(
        `Identity configurations requires a valid instance of Crypto`
      )
    }
    return class extends CryptoConsumer {
      static get crypto() {
        return crypto
      }
    }
  }
  /**
   * Gets the Client constructor for creating identity Clients.
   *
   * @return {Function} The constructor function for creating a Client instance.
   */
  static get Client() {
    return Client
  }

  /**
   * Gets the Config constructor for creating Identity configuration objects.
   *
   * @return {Function} The identity Config constructor function.
   */
  static get Config() {
    return Config
  }

  /**
   * Abstract getter for a storage Client constructor function.
   *
   * When implementing this class, this getter must be overloaded. When called it
   * should offer up a storage Client constructor function. Identity constructs
   * storage clients as part of creating Identity clients.
   *
   * An additional instance level getter is also provided which allows fetching
   * the storage client constructor in both static _and_ instance method
   * contexts as `this.StorageClient`.
   *
   * @return {Client} The storage Client constructor.
   */
  static get StorageClient() {
    throw new Error(
      'Implementing classes must overloaded the StorageClient method to provide a valid storage Client constructor.'
    )
  }

  constructor(config) {
    super()
    this.config = config
  }

  /**
   * Allows `this.StorageClient` syntax in instance methods.
   *
   * Gets the static StorageClient constructor available in the static class. By
   * returning it as a getter `this.StorageClient` syntax is support in
   * instance methods.
   *
   * @returns {Client} The storage Client constructor.
   */
  get StorageClient() {
    // Use this.constructor to ensure we referencing the implementing class, not an interface class.
    return this.constructor.StorageClient
  }

  /**
   * Register a new identity with the Tozny identity service.
   *
   * This method creates a new identity service user and associated storage identity. Using the
   * passed username and password it derives encryption keys and writes those credentials to a
   * Tozny Storage Secure Note. This note is fetch-able using the username/password derived keys.
   *
   * It also create a broker-based set of recovery notes protected by the provided email that are
   * used to recover the account in the event the user forgets their password.
   *
   * Finally, the fully constructed Client for the user is returned, ready to make requests using
   * the user identity that was just created.
   *
   * @param {string} username The name to associate with the user in the configured realm.
   *                          may be the same as the email value.
   * @param {string} password The secret used to protect the users identity and encryption keys.
   * @param {string} token The registration token to create the storage client with.
   * @param {string} email The email address used for email brokered access to the identity.
   *
   * @return {Client} The identity Client for the user that was just registered with the realm.
   */
  async register(username, password, token, email) {
    const cryptoKeys = await this.StorageClient.generateKeypair()
    const signingKeys = await this.StorageClient.generateSigningKeypair()
    /* eslint-disable camelcase */
    const payload = {
      realm_registration_token: token,
      realm_name: this.config.realmName,
      identity: {
        realm_name: this.config.realmName,
        name: username,
        public_key: new PublicKey(cryptoKeys.publicKey),
        signing_key: new SigningKey(signingKeys.publicKey),
      },
    }
    /* eslint-enable */
    const request = await fetch(this.config.apiUrl + '/v1/identity/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const json = await validateResponseAsJSON(request)
    const idConfig = this.config.clone({ username, userId: json.identity.id })
    const storageClientConfig = new StorageConfig(
      json.identity.tozny_id,
      json.identity.api_key_id,
      json.identity.api_secret_key,
      cryptoKeys.publicKey,
      cryptoKeys.privateKey,
      this.config.apiUrl,
      signingKeys.publicKey,
      signingKeys.privateKey
    )
    const storageClient = new this.StorageClient(storageClientConfig)
    const idClient = new Client(idConfig, storageClient, this.crypto)
    // Login note
    const { noteID, cryptoKeyPair, signingKeyPair } = await deriveNoteCreds(
      this.config,
      this.crypto,
      username,
      password
    )
    /* eslint-disable camelcase */
    await idClient.storageClient.writeNote(
      idClient.serialize(),
      cryptoKeyPair.publicKey,
      signingKeyPair.publicKey,
      {
        id_string: noteID,
        max_views: -1,
        expires: false,
      }
    )
    /* eslint-enable */
    const brokerClientID = json.realm_broker_identity_tozny_id
    // If there is no broker, do not try to write broker notes
    if (brokerClientID === '00000000-0000-0000-0000-000000000000') {
      return idClient
    }
    const brokerInfo = await idClient.storageClient.clientInfo(brokerClientID)
    const brokerKeyNoteName = await this.crypto.hash(
      `brokerKey:${username}@realm:${this.config.realmName}`
    )
    const brokerKeyBytes = await this.crypto.randomBytes(64)
    const brokerKey = await this.crypto.b64encode(brokerKeyBytes)
    const brokerNoteCreds = await deriveNoteCreds(
      this.config,
      this.crypto,
      username,
      brokerKey,
      true
    )
    /* eslint-disable camelcase */
    const brokerKeyNote = await idClient.storageClient.writeNote(
      { brokerKey, username },
      brokerInfo.publicKey.curve25519,
      brokerInfo.signingKey.ed25519,
      {
        id_string: brokerKeyNoteName,
        max_views: -1,
        expires: false,
        eacp: {
          email_eacp: {
            email_address: email,
            template: 'password_reset',
            provider_link: this.config.brokerTargetUrl,
          },
        },
      }
    )
    await idClient.storageClient.writeNote(
      idClient.serialize(),
      brokerNoteCreds.cryptoKeyPair.publicKey,
      brokerNoteCreds.signingKeyPair.publicKey,
      {
        id_string: brokerNoteCreds.noteID,
        max_views: -1,
        expires: false,
        eacp: {
          last_access_eacp: {
            last_read_note_id: brokerKeyNote.noteId,
          },
        },
      }
    )
    /* eslint-enable */

    return idClient
  }

  /**
   * Get the stored identity credentials for a user and create a Client for them.
   *
   * The username and password are used to derive encryption keys used to fetch a pre-stored
   * note which contains the users identity credentials.
   *
   * Broker mode is used when another identity holds the seed (password) used for
   * the login. Standard login flows with username and password should always use
   * `broker = false` or omit the parameter.
   *
   * @param {string} username The username of the identity to create a Client for.
   * @param {string} password The secret password of the identity to create a Client for.
   * @param {boolean} broker Whether or not the password is for a brokered note. False for normal logins.
   *
   * @return {Client} The identity Client object for the user.
   */
  async login(username, password, broker = false) {
    const { noteID, cryptoKeyPair, signingKeyPair } = await deriveNoteCreds(
      this.config,
      this.crypto,
      username,
      password,
      broker
    )
    const storedCreds = await this.StorageClient.readNoteByName(
      noteID,
      cryptoKeyPair,
      signingKeyPair,
      this.config.apiUrl
    )

    const user = this.fromObject(storedCreds.data)

    // Backwards compatibility for any identity user whose username was not
    // written to the credentials note.
    if (user.config.username !== username) {
      user.config.username = username
    }

    return user
  }

  /**
   * Recreate a identity Client from a serialized representation.
   *
   * When storing an identity client, this method will reconstitute the Client from
   * a serialized representation. The plain JS object is unpacked a new, fully ready
   * Client instance is returned based on the serialized values.
   *
   * @param {Object} obj The serialized Javascript object representing a user.
   *
   * @return {Client} The reconstituted identity client for the user.
   */
  fromObject(obj) {
    // Allow JSON string objects for ease of use.
    if (typeof obj === 'string') {
      try {
        obj = JSON.parse(obj)
      } catch (err) {
        throw new Error(
          'Config.fromObject param JSON string could not be parsed.'
        )
      }
    }
    // Ensure object shape is generally correct
    if (!obj.config) {
      throw new Error(
        'To create an identity client from an object it must contain identity configuration'
      )
    }
    if (!obj.storageConfig) {
      throw new Error(
        'To create an identity client from an object it must contain storageConfig with valid Storage Client configuration'
      )
    }

    // Set up identity client config
    if (obj.config.realmName !== this.config.realmName) {
      throw new Error('you suck, go away')
    }
    const idConfig = this.config.clone({
      username: obj.config.username,
      userId: obj.config.userId,
    })
    // Validate the configuration matches this realm
    if (trimSlash(idConfig.apiUrl) !== trimSlash(this.config.apiUrl)) {
      throw new Error('The client and realm must use the same api url')
    }
    if (idConfig.realmName !== this.config.realmName) {
      throw new Error(
        'only clients from the configured realm can be instantiated.'
      )
    }

    // Set up storage client
    const storageClientConfig = StorageConfig.fromObject(obj.storageConfig)
    const storageClient = new this.StorageClient(storageClientConfig)
    // Create the realm client
    return new Client(idConfig, storageClient, this.crypto)
  }

  /**
   * A wrapper around the broker login flow used for email account recovery.
   *
   * @param {string} username The username to recover.
   * @param {string} recoveryUrl The URL to send the reset initiation to.
   */
  initiateRecovery(username, recoveryUrl) {
    return this.initiateBrokerLogin(username, recoveryUrl)
  }

  /**
   * A wrapper around the completion of a broker flow used for email account recovery.
   *
   * Once complete a password update should immediately be initiated for the user.
   *
   * @param {string} otp The one-time password from the email challenge issued.
   * @param {string} noteId The ID of the note the email challenge was for.
   * @param {string} recoveryUrl The URL to send the recovery authentication to.
   *
   * @return{Promise<Client>} The recovered identity Client.
   */
  completeRecovery(otp, noteId, recoveryUrl) {
    /* eslint-disable camelcase */
    return this.completeBrokerLogin({ email_otp: otp }, noteId, recoveryUrl)
    /* eslint-enable */
  }

  /**
   * Begin a broker-based login flow.
   *
   * Broker flows are when another party holds the seed material used to access an
   * identity account. The broker's access to the seed material is generally protected
   * by an extra policy check controlled by the user. The initiation request informs
   * the broker that the user wishes to collect their seed, which causes the broker
   * to initiate any challenges required by to access the seed material.
   *
   * @param {string} username The username of the user wishing to access their credentials.
   * @param {string} brokerUrl The URL where the broker can be contacted.
   */
  async initiateBrokerLogin(
    username,
    brokerUrl = `${this.config.apiUrl}/v1/identity/broker/realm/${this.config.realmName}/challenge`
  ) {
    const payload = {
      username,
      action: 'challenge',
    }
    const request = await fetch(brokerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    await checkStatus(request)
    return request.status === 200 ? request.json() : true
  }

  /**
   * Complete a broker based login flow by giving the broker the needed authentication information.
   *
   * After initiating a broker-based login, the storage system will issue a challenge to the user,
   * such as an email containing a one-time password. This information is passed back to the broker
   * proving the user has granted them access to the seed material. The broker then encrypts and
   * returns the seed to the user who is then able to derive the keys needed to fetch their identity
   * credentials and create a Client instance.
   *
   * @param {*} authResponse The authentication material to allow a broker to access the seed material.
   * @param {string} noteId The ID of the note containing the seed material.
   * @param {string} brokerUrl The URL where the broker can be contacted.
   *
   * @return {Client} An identity Client for the user.
   */
  async completeBrokerLogin(
    authResponse,
    noteId,
    brokerUrl = `${this.config.apiUrl}/v1/identity/broker/realm/${this.config.realmName}/login`
  ) {
    // Generate ephemeral keys for broker key transfer
    const cryptoKeys = await this.StorageClient.generateKeypair()
    const signingKeys = await this.StorageClient.generateSigningKeypair()
    // Request the broker write the key transfer note.
    /* eslint-disable camelcase */
    const payload = {
      auth_response: authResponse,
      note_id: noteId,
      public_key: cryptoKeys.publicKey,
      signing_key: signingKeys.publicKey,
      action: 'login',
    }
    /* eslint-enable */
    const request = await fetch(brokerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const { transferId } = await validateResponseAsJSON(request)
    // Fetch the broker key transfer note
    const brokerKeyNote = await this.StorageClient.readNote(
      transferId,
      cryptoKeys,
      signingKeys,
      this.config.apiUrl
    )
    const { brokerKey, username } = brokerKeyNote.data
    // Use the broker key to complete the login flow
    return this.login(username, brokerKey, true)
  }
}
