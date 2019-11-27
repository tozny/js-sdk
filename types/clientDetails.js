const PublicKey = require('./publicKey')
const SigningKey = require('./signingKey')

/**
 * Full information about a specific E3DB client, including the client's
 * public/private keys for cryptographic operations and API credentials.
 *
 * @property {string}     clientId   UUID representing the client.
 * @property {string}     apiKeyId   API key to be used when authenticating with e3db
 * @property {string}     apiSecret  API password to be used when authenticating with e3db
 * @property {PublicKey}  publicKey  Curve25519 public key for the client.
 * @property {string}     name       Description of the client
 * @property {SigningKey} signingKey Ed25519 public key for the client.
 */
class ClientDetails {
  constructor(
    clientId,
    apiKeyId,
    apiSecret,
    publicKey,
    name,
    signingKey = null
  ) {
    this.clientId = clientId
    this.apiKeyId = apiKeyId
    this.apiSecret = apiSecret
    this.publicKey = publicKey
    this.name = name

    if (signingKey === null) {
      signingKey = new SigningKey(null)
    }

    this.signingKey = signingKey
  }

  /**
   * Specify how an already unserialized JSON array should be marshaled into
   * an object representation.
   *
   * Client information contains the ID of the client, API credentials for interacting
   * with the e3db server, a Curve25519 public key component, and a description of the
   * client as specified during creation.
   *
   * <code>
   * info = ClientDetails::decode({
   *   client_id: '',
   *   api_key_id: '',
   *   api_secret: '',
   *   public_key: {
   *     curve25519: ''
   *   },
   *   signing_key: {
   *     ed25519: ''
   *   },
   *   name: ''
   * })
   * <code>
   *
   * @param {object} json
   *
   * @return {Promise<ClientDetails>}
   */
  static async decode(json) {
    let publicKey = await PublicKey.decode(json.public_key)

    let signingKey = new SigningKey(null)
    // eslint-disable-next-line no-prototype-builtins
    if (json.hasOwnProperty('signing_key')) {
      signingKey = await SigningKey.decode(json.signing_key)
    }

    return Promise.resolve(
      new ClientDetails(
        json.client_id,
        json.api_key_id,
        json.api_secret,
        publicKey,
        json.name,
        signingKey
      )
    )
  }
}

module.exports = ClientDetails
