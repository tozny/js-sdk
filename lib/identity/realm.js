const Config = require('./config')
const fetch = require('isomorphic-fetch')
const {
  validateResponseAsJSON,
  trimSlash,
  checkStatus,
  urlEncodeData,
} = require('../utils')
const { deriveNoteCreds } = require('./shared')
const CryptoConsumer = require('../crypto/cryptoConsumer')
const { PublicKey, SigningKey } = require('../../types')
const { DEFAULT_API_URL } = require('../utils/constants')
const AuthenticatedRequest = require('../request/authenticatedRequest')

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
    emailEACPExpiryMinutes
  ) {
    username = username.toLowerCase()
    const cryptoKeys = await this.storage.generateKeypair()
    const signingKeys = await this.storage.generateSigningKeypair()
    /* eslint-disable camelcase */
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
      },
    }
    /* eslint-enable */
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
      this.apiUrl,
      signingKeys.publicKey,
      signingKeys.privateKey
    )
    const storageClient = new this.storage.Client(storageClientConfig)
    const idClient = new this.PartialClient(idConfig, storageClient)
    // Login note
    const { noteName, cryptoKeyPair, signingKeyPair } = await deriveNoteCreds(
      this.realmName,
      this.crypto,
      username,
      password
    )
    /* eslint-disable camelcase */
    await idClient.storage.writeNote(
      idClient.serializeData(),
      cryptoKeyPair.publicKey,
      signingKeyPair.publicKey,
      {
        id_string: noteName,
        max_views: -1,
        expires: false,
        eacp: {
          tozid_eacp: {
            realm_name: this.realmName,
          },
        },
      }
    )
    /* eslint-enable */
    const brokerClientID = json.realm_broker_identity_tozny_id
    // If there is no broker, do not try to write broker notes
    if (brokerClientID === '00000000-0000-0000-0000-000000000000') {
      return idClient
    }
    const brokerInfo = await idClient.storage.clientInfo(brokerClientID)
    const brokerKeyNoteName = await this.crypto.hash(
      `brokerKey:${username}@realm:${this.realmName}`
    )
    const brokerKeyBytes = await this.crypto.randomBytes(64)
    const brokerKey = await this.crypto.platform.b64URLEncode(brokerKeyBytes)
    const brokerNoteCreds = await deriveNoteCreds(
      this.realmName,
      this.crypto,
      username,
      brokerKey,
      'email_otp'
    )
    /* eslint-disable camelcase */
    let brokerNoteOptions = {
      id_string: brokerKeyNoteName,
      max_views: -1,
      expires: false,
      eacp: {
        email_eacp: {
          email_address: email,
          template: 'claim_account',
          provider_link: this.brokerTargetUrl,
          default_expiration_minutes: emailEACPExpiryMinutes,
        },
      },
    }
    if (firstName !== undefined || lastName !== undefined) {
      let identityName = ''
      if (lastName === undefined) {
        identityName = firstName
      } else if (firstName === undefined) {
        identityName = lastName
      } else {
        identityName = `${firstName} ${lastName}`
      }
      brokerNoteOptions.eacp.email_eacp.template_fields = {
        name: identityName,
      }
    }
    const brokerKeyNote = await idClient.storage.writeNote(
      { brokerKey, username },
      brokerInfo.publicKey.curve25519,
      brokerInfo.signingKey.ed25519,
      brokerNoteOptions
    )
    await idClient.storage.writeNote(
      idClient.serializeData(),
      brokerNoteCreds.cryptoKeyPair.publicKey,
      brokerNoteCreds.signingKeyPair.publicKey,
      {
        id_string: brokerNoteCreds.noteName,
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

    // Write notes for Tozny OTP based broker password reset flow
    const brokerToznyOTPKeyNoteName = await this.crypto.hash(
      `broker_otp:${username}@realm:${this.realmName}`
    )
    const brokerToznyOTPKeyBytes = await this.crypto.randomBytes(64)
    const brokerToznyOTPKey = await this.crypto.platform.b64URLEncode(
      brokerToznyOTPKeyBytes
    )
    const brokerToznyOTPNoteCreds = await deriveNoteCreds(
      this.realmName,
      this.crypto,
      username,
      brokerToznyOTPKey,
      'tozny_otp'
    )
    /* eslint-disable camelcase */
    const brokerToznyOTPKeyNote = await idClient.storage.writeNote(
      { brokerKey: brokerToznyOTPKey, username },
      brokerInfo.publicKey.curve25519,
      brokerInfo.signingKey.ed25519,
      {
        id_string: brokerToznyOTPKeyNoteName,
        max_views: -1,
        expires: false,
        eacp: {
          tozny_otp_eacp: {
            include: true,
          },
        },
      }
    )
    await idClient.storage.writeNote(
      idClient.serializeData(),
      brokerToznyOTPNoteCreds.cryptoKeyPair.publicKey,
      brokerToznyOTPNoteCreds.signingKeyPair.publicKey,
      {
        id_string: brokerToznyOTPNoteCreds.noteName,
        max_views: -1,
        expires: false,
        eacp: {
          last_access_eacp: {
            last_read_note_id: brokerToznyOTPKeyNote.noteId,
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
   * @param {Function} actionHandler If any login actions occur, this callback is responsible for handling them.
   * @param {boolean} credentialType What style credentials to complete the login with `password` for normal logins.
   *
   * @return {Promise<object>} An object containing the proper OIDC redirect URL
   */
  async login(username, password, actionHandler, credentialType = 'password') {
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
    let sessionStart = await validateResponseAsJSON(request)
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

    let resp = await validateResponseAsJSON(sessionRequest)

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
      const data = await actionHandler(err, actionData)
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
      resp = await validateResponseAsJSON(actionRequest)
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
    const tokenInfo = await validateResponseAsJSON(finalRequest)
    const token = tokenInfo.access_token
    const storedCreds = await this.storage.readNoteByName(
      noteName,
      cryptoKeyPair,
      signingKeyPair,
      {},
      {
        'X-TOZID-LOGIN-TOKEN': token,
      },
      this.apiUrl
    )

    const configObject = storedCreds.data
    configObject.agent = tokenInfo
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
    try {
      if (typeof obj === 'string') {
        obj = JSON.parse(obj)
      }
      if (typeof obj.config === 'string') {
        obj.config = JSON.parse(obj.config)
      }
    } catch (err) {
      throw new Error(
        'Config.fromObject param JSON string could not be parsed.'
      )
    }
    // Ensure object shape is generally correct
    if (!obj.config) {
      throw new Error(
        'To create an identity client from an object it must contain identity configuration'
      )
    }
    if (!obj.storage) {
      throw new Error(
        'To create an identity client from an object it must contain a storage object with valid Storage Client configuration'
      )
    }

    // Validate the configuration matches this realm
    if (trimSlash(this.apiUrl) !== trimSlash(obj.config.apiUrl)) {
      throw new Error('The client and realm must use the same api url')
    }

    // Set up identity client config
    if (this.realmName !== obj.config.realmName) {
      throw new Error('The identity must be part of the configured realm')
    }
    const idConfig = new Config(
      this.realmName,
      this.appName,
      this.apiUrl,
      obj.config.username,
      obj.config.userId,
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
  completeEmailRecovery(otp, noteId, recoveryUrl) {
    /* eslint-disable camelcase */
    return this.completeBrokerLogin(
      { email_otp: otp },
      noteId,
      'email_otp',
      recoveryUrl
    )
    /* eslint-enable */
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
    /* eslint-disable camelcase */
    return this.completeBrokerLogin(
      { tozny_otp: otp },
      noteId,
      'tozny_otp',
      recoveryUrl
    )
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
    brokerUrl = `${this.apiUrl}/v1/identity/broker/realm/${this.realmName}/challenge`
  ) {
    username = username.toLowerCase()
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
   * @param {string} brokerType
   * @param {string} brokerUrl The URL where the broker can be contacted.
   *
   * @return {PartialClient} A partial identity Client for the user usabled to update passwords.
   */
  async completeBrokerLogin(
    authResponse,
    noteId,
    brokerType,
    brokerUrl = `${this.apiUrl}/v1/identity/broker/realm/${this.realmName}/login`
  ) {
    // Generate ephemeral keys for broker key transfer
    const cryptoKeys = await this.storage.generateKeypair()
    const signingKeys = await this.storage.generateSigningKeypair()
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
    const brokerKeyNote = await this.storage.readNote(
      transferId,
      cryptoKeys,
      signingKeys,
      {},
      {},
      this.apiUrl
    )
    const { brokerKey, username } = brokerKeyNote.data
    // Use the broker key to complete the login flow
    // return this.login(username, brokerKey, brokerType)
    const { noteName, cryptoKeyPair, signingKeyPair } = await deriveNoteCreds(
      this.realmName,
      this.crypto,
      username,
      brokerKey,
      brokerType
    )
    const storedCreds = await this.storage.readNoteByName(
      noteName,
      cryptoKeyPair,
      signingKeyPair,
      {},
      {},
      this.apiUrl
    )

    const user = this.fromObject(storedCreds.data)

    // Backwards compatibility for any identity user whose username was not
    // written to the credentials note.
    if (user.config.username !== username) {
      user.config.username = username
    }

    return user
  }
}

module.exports = Realm
