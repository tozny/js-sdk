const PublicKey = require('./publicKey')
const SigningKey = require('./signingKey')

/**
 * Information about a specific E3DB client, including the client's
 * public key to be used for cryptographic operations.
 *
 * @property {string}     clientId   UUID representing the client.
 * @property {PublicKey}  publicKey  Curve25519 public key for the client.
 * @property {bool}       validated  Flag whether or not the client has been validated.
 * @property {SigningKey} signingKey Ed25519 public key for the client.
 */
class ClientInfo {
  constructor(clientId, publicKey, validated, signingKey) {
    this.clientId = clientId
    this.publicKey = publicKey
    this.validated = validated

    if (signingKey === null) {
      signingKey = new SigningKey(null)
    }

    this.signingKey = signingKey
  }

  /**
   * Specify how an already unserialized JSON array should be marshaled into
   * an object representation.
   *
   * Client information contains the ID of the client, a Curve25519 public key
   * component, and a flag describing whether or not the client has been validated.
   *
   * <code>
   * info = ClientInfo::decode({
   *   client_id: '',
   *   public_key: {
   *     curve25519: ''
   *   },
   *   signing_key: {
   *     ed25519: ''
   *   },
   *   validated: true
   * })
   * <code>
   *
   * @param {object} json
   *
   * @return {Promise<ClientInfo>}
   */
  static async decode(json) {
    let publicKey = await PublicKey.decode(json.public_key)

    let signingKey = new SigningKey(null)
    // eslint-disable-next-line no-prototype-builtins
    if (json.hasOwnProperty('signing_key') && json.signing_key !== null) {
      signingKey = await SigningKey.decode(json.signing_key)
    }

    return Promise.resolve(
      new ClientInfo(json.client_id, publicKey, json.validated, signingKey)
    )
  }
}

module.exports = ClientInfo
