const Config = require('./config')
const fetch = require('isomorphic-fetch')
const {
  validateResponseAsJSON,
  credentialedDecodeResponse,
  credentialNoteCall,
  trimSlash,
  checkStatus,
  urlEncodeData,
} = require('../utils')
const {
  deriveNoteCreds,
  writeBrokerNotes,
  writePasswordNote,
  writeFederationNote,
} = require('./shared')
const CryptoConsumer = require('../crypto/cryptoConsumer')
const { CredentialDataError } = require('../../types/errors/identity')
const { PublicKey, SigningKey } = require('../../types')
const { DEFAULT_API_URL } = require('../utils/constants')
const AuthenticatedRequest = require('../request/authenticatedRequest')

const publicInfoCache = []

/**
 * Identity represents a connection to the Tozny Identity service on behalf of a realm.
 *
 * Before registration, login, or other client creation methods are possible, the configuration
 * for a Tozny Identity realm is needed. Identity holds this configuration and provides methods
 * for all pre-client operations. In other words, the methods this object make identity clients
 * for users that belong to the configured realm. It helps authenticate users.
 */
class Realm extends CryptoConsumer {
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
   * @return {Storage} The storage Client constructor.
   */
  static get storage() {
    throw new Error(
      'Implementing classes must overloaded the storage method to provide a valid storage instance.'
    )
  }

  /**
   * Allows `this.storage` syntax in instance methods.
   *
   * Gets the static storage instance available in the static class. By
   * returning it as a getter `this.storage` syntax is support in
   * instance methods.
   *
   * @returns {Storage} The storage instance to use in this identity realm.
   */
  get storage() {
    // Use this.constructor to ensure we referencing the implementing class, not an interface class.
    return this.constructor.storage
  }

  /**
   * Abstract getter for a Client constructor function.
   *
   * When implementing this class, this getter must be overloaded. When called it
   * should offer up a Client constructor function.
   *
   * An additional instance level getter is also provided which allows fetching
   * the Client constructor in both static _and_ instance method
   * contexts as `this.Client`.
   *
   * @return {function} The Client constructor.
   */
  static get Client() {
    throw new Error(
      'Implementing classes must overloaded the storage method to provide a valid storage instance.'
    )
  }

  /**
   * Abstract getter for a PartialClient constructor function.
   *
   * When implementing this class, this getter must be overloaded. When called it
   * should offer up a PartialClient constructor function.
   *
   * An additional instance level getter is also provided which allows fetching
   * the partial client constructor in both static _and_ instance method
   * contexts as `this.PartialClient`.
   *
   * @return {function} The Partial Client constructor.
   */
  static get PartialClient() {
    throw new Error(
      'Implementing classes must overloaded the PartialClient method to provide a valid PartialClient constructor.'
    )
  }

  /**
   * Allows `this.Client` syntax in instance methods.
   *
   * Gets the static Client constructor available in the static class. By
   * returning it as a getter `this.Client` syntax is support in
   * instance methods.
   *
   * @returns {function} The Client constructor to use in this identity realm.
   */
  get Client() {
    // Use this.constructor to ensure we referencing the implementing class, not an interface class.
    return this.constructor.Client
  }

  /**
   * Allows `this.PartialClient` syntax in instance methods.
   *
   * Gets the static PartialClient constructor available in the static class. By
   * returning it as a getter `this.PartialClient` syntax is support in
   * instance methods.
   *
   * @returns {function} The PartialClient constructor to use in this identity realm.
   */
  get PartialClient() {
    // Use this.constructor to ensure we referencing the implementing class, not an interface class.
    return this.constructor.PartialClient
  }

  constructor(realmName, appName, brokerTargetUrl, apiUrl = DEFAULT_API_URL) {
    super()
    this.realmName = realmName
    this.appName = appName
    this.brokerTargetUrl = brokerTargetUrl
    this.apiUrl = apiUrl
  }

  /**
   * Gets the public realm info
   *
   * If the info is available in the cache, the cache is returned without a
   * network request. If a refresh is requested, or the cache is empty it gets
   * a copy of the info from the realms public info endpoint and updates the
   * cache for future requests.
   *
   * @param {boolean} refresh Whether or not to force refresh the cache
   * @returns {Promise<object>} A promise resolving to the public info object.
   */
  async info(refresh = false) {
    if (!publicInfoCache[this.realmName] || refresh) {
      try {
        const info = await validateResponseAsJSON(
          await fetch(`${this.apiUrl}/v1/identity/info/realm/${this.realmName}`)
        )
        publicInfoCache[this.realmName] = info
      } catch (e) {
        throw new Error("Unable to fetch public realm info: '${e.message}'")
      }
    }
    return publicInfoCache[this.realmName]
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
   * @param {string} firstName The first name to associate with the identity.
   * @param {string} lastName The last name to associate with the identity.
   * @param {int}    emailEACPExpiryMinutes The number of minutes email eacps should be valid for
   *
   *
   * @return {Client} The identity Client for the user that was just registered with the realm.
   */
  async register(
    username,
    password,
    token,
    email,
    firstName,
    lastName,
    emailEACPExpiryMinutes = 60
  ) {
    username = username.toLowerCase()
    const cryptoKeys = await this.storage.generateKeypair()
    const signingKeys = await this.storage.generateSigningKeypair()
    const payload = {
      realm_registration_token: token,
      realm_name: this.realmName,
      identity: {
        realm_name: this.realmName,
        name: username,
        public_key: new PublicKey(cryptoKeys.publicKey),
        signing_key: new SigningKey(signingKeys.publicKey),
        first_name: firstName,
        last_name: lastName,
        email: email,
      },
    }
    const request = await fetch(this.apiUrl + '/v1/identity/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const json = await validateResponseAsJSON(request)
    const idConfig = new Config(
      this.realmName,
      this.appName,
      this.apiUrl,
      username,
      json.identity.id,
      this.brokerTargetUrl
    )
    const storageClientConfig = new this.storage.Config(
      json.identity.tozny_id,
      json.identity.api_key_id,
      json.identity.api_secret_key,
      cryptoKeys.publicKey,
      cryptoKeys.privateKey,
      signingKeys.publicKey,
      signingKeys.privateKey,
      this.apiUrl
    )
    const storageClient = new this.storage.Client(storageClientConfig)
    const idClient = new this.PartialClient(idConfig, storageClient)
    // Login note
    await writePasswordNote(idClient, password, false)
    await writeBrokerNotes(
      idClient,
      email,
      json.realm_broker_identity_tozny_id,
      false,
      emailEACPExpiryMinutes
    )

    return idClient
  }

  async registerFederatedUser(username, data, cryptoKeys, signingKeys) {
    const { result } = data.context
    const user = await this.fromObject({
      config: {
        api_url: this.apiUrl,
        realm_name: this.realmName,
        username: username,
        user_id: result.identity.id,
      },
      storage: {
        version: 2,
        client_id: result.identity.tozny_id,
        api_key_id: result.identity.api_key_id,
        api_secret: result.identity.api_secret_key,
        public_key: cryptoKeys.publicKey,
        private_key: cryptoKeys.privateKey,
        public_signing_key: signingKeys.publicKey,
        private_signing_key: signingKeys.privateKey,
        api_url: this.apiUrl,
      },
    })
    const brokerId = result.realm_broker_identity_tozny_id
    await writeFederationNote(user, brokerId, true)
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
   * @param {Function} actionHandler If any login actions occur, this callback is responsible for handling them.
   * @param {boolean} credentialType What style credentials to complete the login with `password` for normal logins.
   *
   * @return {Promise<object>} An object containing the proper OIDC redirect URL
   */
  async login(username, password, actionHandler, credentialType = 'password') {
    // TODO: consider breaking out sub-functions for better readability.
    username = username.toLowerCase()
    const { noteName, cryptoKeyPair, signingKeyPair } = await deriveNoteCreds(
      this.realmName,
      this.crypto,
      username,
      password,
      credentialType
    )
    let anonAuth = await AuthenticatedRequest.anonymousAuth(
      this.crypto,
      signingKeyPair.publicKey,
      signingKeyPair.privateKey,
      this.apiUrl
    )
    const request = await anonAuth.tsv1Fetch(
      `${this.apiUrl}/v1/identity/login`,
      {
        method: 'POST',
        body: JSON.stringify({
          username: username,
          realm_name: this.realmName,
          app_name: this.appName,
          login_style: 'api',
        }),
      }
    )
    let sessionStart = await credentialedDecodeResponse(request)
    // Note that sessionStart was originally just used to transfer query params,
    // but it now pulls double duty to transfer this federated flag. It would be
    // better to have the object structured for this, but federation features
    // were needed quickly. This can and should be refactored for better clarity
    // at a later date (with a breaking change in the API).
    const { federated } = sessionStart
    delete sessionStart.federated
    const sessionRequest = await fetch(
      `${this.apiUrl}/auth/realms/${this.realmName}/protocol/openid-connect/auth`,
      {
        method: 'POST',
        body: urlEncodeData(sessionStart),
        headers: {
          Accepts: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    )

    let resp = await credentialedDecodeResponse(sessionRequest)
    // Scope the key variables here so they are persistent between iterations in
    // this while block. When registering an identity it requires two round
    // responses from the server. The first to indicate that registering a
    // new client is required, the second to provide the new clients server
    // created details. We have to keep the private keys in state while the
    // call to register the new credentials is made. Scoping these here keeps
    // the private keys in memory.
    // The register-brokered-user and complete-broker-registration must always
    // run in series.
    let cryptoKeys
    let signingKeys
    while (resp.login_action) {
      if (resp.type == 'fetch') {
        break
      }
      const err =
        resp.message && resp.message.type == 'error'
          ? new Error(resp.message.summary)
          : null
      const actionData = {
        type: resp.type,
        fields: resp.fields,
        context: resp.context,
      }
      let data
      switch (resp.type) {
        case 'continue':
          data = {}
          break
        case 'password-challenge':
          data = { password }
          break
        // The server has hinted this federated user doesn't have a client yet
        case 'register-brokered-user':
          cryptoKeys = await this.storage.generateKeypair()
          signingKeys = await this.storage.generateSigningKeypair()
          data = {
            public_key: cryptoKeys.publicKey,
            public_signing_key: signingKeys.publicKey,
          }
          break
        // The federated client was created, now we can create the full user
        // object for TozID with the returned client data and write the notes
        // for future client fetching.
        case 'complete-broker-registration':
          await this.registerFederatedUser(
            username,
            resp,
            cryptoKeys,
            signingKeys
          )
          data = {}
          break
        default:
          data = await actionHandler(err, actionData)
          break
      }
      let body
      if (resp.content_type === 'application/x-www-form-urlencoded') {
        body = urlEncodeData(data)
      } else {
        body = JSON.stringify(data)
      }
      const actionRequest = await anonAuth.tsv1Fetch(resp.action_url, {
        method: 'POST',
        body,
        headers: {
          'Content-Type': resp.content_type,
        },
      })
      resp = await credentialedDecodeResponse(actionRequest)
    }
    const finalRequest = await anonAuth.tsv1Fetch(
      `${this.apiUrl}/v1/identity/tozid/redirect`,
      {
        method: 'POST',
        body: JSON.stringify({
          realm_name: this.realmName,
          session_code: resp.context.session_code,
          execution: resp.context.execution,
          tab_id: resp.context.tab_id,
          client_id: resp.context.client_id,
          auth_session_id: resp.context.auth_session_id,
        }),
      }
    )
    const tokenInfo = await credentialedDecodeResponse(finalRequest)
    const token = tokenInfo.access_token
    let storedCreds
    if (federated) {
      const keyNoteName = await this.crypto.hash(
        `federated:${username}@realm:${this.realmName}`
      )
      const parameters = {
        note_name: keyNoteName,
        auth_headers: {
          'X-TOZID-LOGIN-TOKEN': token,
        },
      }
      storedCreds = await this.directBrokeredCreds(parameters, 'password')
    } else {
      storedCreds = await credentialNoteCall(
        this.storage.readNoteByName(
          noteName,
          cryptoKeyPair,
          signingKeyPair,
          {},
          {
            'X-TOZID-LOGIN-TOKEN': token,
          },
          this.apiUrl
        )
      )
    }

    const configObject = storedCreds.data
    configObject.agent = tokenInfo
    const user = this.fromObject(configObject)

    // Detect old format configuration. If found, migrate it.
    // The config is a string here. Rather than parse it twice, check to see
    // if the storage object contain a came case key string
    if (
      configObject.storage.indexOf('clientId') !== -1 &&
      credentialType === 'password'
    ) {
      // Run this in an IIFE to ensure it is a fire-and-forget update (do not
      // await these async functions).
      ;(async () => {
        const info = await this.info()
        writePasswordNote(user, password, true)
        writeBrokerNotes(user, user.config.username, info.broker_id, true)
      })()
    }

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
    try {
      if (typeof obj === 'string') {
        obj = JSON.parse(obj)
      }
      if (typeof obj.config === 'string') {
        obj.config = JSON.parse(obj.config)
      }
    } catch (err) {
      throw new CredentialDataError(
        'Config.fromObject param JSON string could not be parsed.'
      )
    }
    // Ensure object shape is generally correct
    if (!obj.config) {
      throw new CredentialDataError(
        'To create an identity client from an object it must contain identity configuration'
      )
    }
    if (!obj.storage) {
      throw new CredentialDataError(
        'To create an identity client from an object it must contain a storage object with valid Storage Client configuration'
      )
    }

    // Validate the configuration matches this realm
    const configUrl = obj.config.api_url || obj.config.apiUrl
    if (trimSlash(this.apiUrl) !== trimSlash(configUrl)) {
      throw new CredentialDataError(
        'The client and realm must use the same api url'
      )
    }

    // Set up identity client config
    const configRealm = obj.config.realm_name || obj.config.realmName
    if (this.realmName !== configRealm) {
      throw new CredentialDataError(
        'The identity must be part of the configured realm'
      )
    }
    const idConfig = new Config(
      this.realmName,
      this.appName,
      this.apiUrl,
      obj.config.username,
      obj.config.user_id || obj.config.userId,
      this.brokerTargetUrl
    )

    // Set up storage client
    const storageClientConfig = this.storage.Config.fromObject(obj.storage)
    const storageClient = new this.storage.Client(storageClientConfig)

    // Create the realm client, partial if not agent token is available
    if (obj.agent && obj.agent.access_token) {
      return new this.Client(idConfig, storageClient, obj.agent)
    } else {
      return new this.PartialClient(idConfig, storageClient)
    }
  }

  /**
   * A wrapper around the broker login flow used for email account recovery.
   *
   * @param {string} username The username to recover.
   * @param {string} recoveryUrl The URL to send the reset initiation to.
   */
  initiateRecovery(username, recoveryUrl) {
    return this.initiateBrokerLogin(
      username,
      {
        email_eacp: {
          template_name: 'password_reset',
        },
      },
      recoveryUrl
    )
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
  completeEmailRecovery(otp, noteId, recoveryUrl) {
    return this.completeBrokerLogin(
      {
        auth_response: { email_otp: otp },
        note_id: noteId,
      },
      'email_otp',
      recoveryUrl
    )
  }

  /**
   * A wrapper around the completion of a broker flow used for tozny link account recovery.
   *
   * Once complete a password update should immediately be initiated for the user.
   *
   * @param {string} otp The one-time password from the link issued.
   * @param {string} noteId The ID of the note the link was for.
   * @param {string} recoveryUrl The URL to send the recovery authentication to.
   *
   * @return{Promise<Client>} The recovered identity Client.
   */
  toznyRecovery(otp, noteId, recoveryUrl) {
    return this.completeBrokerLogin(
      {
        auth_response: { tozny_otp: otp },
        note_id: noteId,
      },
      'tozny_otp',
      recoveryUrl
    )
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
    meta,
    brokerUrl = `${this.apiUrl}/v1/identity/broker/realm/${this.realmName}/challenge`
  ) {
    username = username.toLowerCase()
    const payload = {
      username,
      meta,
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
    const contentType = request.headers.get('content-type')
    return contentType && contentType.indexOf('application/json') !== -1
      ? request.json()
      : true
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
   * @param {*} parameters The authentication material to allow a broker to access the seed material.
   * @param {string} brokerType
   * @param {string} brokerUrl The URL where the broker can be contacted.
   *
   * @return {PartialClient} A partial identity Client for the user usable to update passwords.
   */
  async completeBrokerLogin(
    parameters,
    brokerType,
    brokerUrl = `${this.apiUrl}/v1/identity/broker/realm/${this.realmName}/login`
  ) {
    const storedCreds = await this.directBrokeredCreds(
      parameters,
      brokerType,
      brokerUrl
    )

    const user = this.fromObject(storedCreds.data)

    // Detect old format configuration. If found, migrate it.
    // The config is a string here. Rather than parse it twice, check to see
    // if the storage object contain a camel case key string
    if (storedCreds.data.storage.indexOf('clientId') !== -1) {
      // Run this in an IIFE to ensure it is a fire-and-forget update (do not
      // await these async functions).
      ;(async () => {
        const info = await this.info()
        writeBrokerNotes(user, user.config.username, info.broker_id, true)
      })()
    }

    return user
  }

  async directBrokeredCreds(
    parameters,
    brokerType,
    brokerUrl = `${this.apiUrl}/v1/identity/broker/realm/${this.realmName}/login`
  ) {
    // Generate ephemeral keys for broker key transfer
    const cryptoKeys = await this.storage.generateKeypair()
    const signingKeys = await this.storage.generateSigningKeypair()
    // Request the broker write the key transfer note.
    const payload = Object.assign({}, parameters, {
      public_key: cryptoKeys.publicKey,
      signing_key: signingKeys.publicKey,
      action: 'login',
    })
    const request = await fetch(brokerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const { transferId } = await credentialedDecodeResponse(request)
    // Fetch the broker key transfer note
    const brokerKeyNote = await this.storage.readNote(
      transferId,
      cryptoKeys,
      signingKeys,
      {},
      {},
      this.apiUrl
    )
    // Use the broker key to complete the login flow
    const { noteName, cryptoKeyPair, signingKeyPair } = await deriveNoteCreds(
      this.realmName,
      this.crypto,
      brokerKeyNote.data.username,
      brokerKeyNote.data.broker_key || brokerKeyNote.data.brokerKey, // When migration code gets removed, only support snake case
      brokerType
    )
    const storedCreds = await credentialNoteCall(
      this.storage.readNoteByName(
        noteName,
        cryptoKeyPair,
        signingKeyPair,
        {},
        {},
        this.apiUrl
      )
    )

    // Backwards compatibility for any identity user whose username was not
    // written to the credentials note.
    if (typeof storedCreds.data.config === 'string') {
      storedCreds.data.config = JSON.parse(storedCreds.data.config)
    }
    if (storedCreds.data.config.username !== brokerKeyNote.data.username) {
      storedCreds.data.config.username = brokerKeyNote.data.username
    }

    // Return the stored credentials
    return storedCreds
  }
}

module.exports = Realm
