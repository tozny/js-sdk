const PublicKey = require('./publicKey')
const Serializable = require('../types/serializable')
const SigningKey = require('./signingKey')

/**
 * Representation of a cached, encrypted access key
 *
 * @property {string} eak
 * @property {string} authorizerID
 * @property {string} authorizerPublicKey
 * @property {string} signerId
 * @property {string} signerSigningKey
 */
class EAKInfo extends Serializable {
  constructor(
    eak,
    authorizerID,
    authorizerPublicKey,
    signerId,
    signerSigningKey
  ) {
    super()

    this.eak = eak
    this.authorizerID = authorizerID
    this.authorizerPublicKey = new PublicKey(authorizerPublicKey)
    this.signerId = signerId
    this.signerSigningKey = new SigningKey(signerSigningKey)
  }

  /* eslint-disable camelcase */

  /**
   * Generate a JSON.stringify-friendly version of the object
   * automatically omitting any `null` fields.
   *
   * @returns {object}
   */
  serializable() {
    let toSerialize = {
      eak: this.eak,
      authorizer_id: this.authorizerID,
      authorizer_public_key: this.authorizerPublicKey,
      signer_id: this.signerId,
      signer_signing_key: this.signerSigningKey,
    }

    for (let key in toSerialize) {
      // eslint-disable-next-line no-prototype-builtins
      if (toSerialize.hasOwnProperty(key)) {
        if (toSerialize[key] === null) {
          delete toSerialize[key]
        }
      }
    }

    return toSerialize
  }

  /* eslint-enable */

  /**
   * Specify how an already unserialized JSON array should be marshaled into
   * an object representation.
   *
   * The array expected for deserializing back into an object requires:
   *
   * <code>
   * $eakInfo = EAKInfo::decode({
   *   'eak'                   => '',
   *   'authorizer_id'         => '',
   *   'authorizer_public_key' => '',
   *   'signer_id'             => '',
   *   'signer_signing_key'    => ''
   * });
   * </code>
   *
   * @param {object} json
   *
   * @return {Promise<EAKInfo>}
   */
  static async decode(json) {
    let signerId = null
    let signingKey = null
    // eslint-disable-next-line no-prototype-builtins
    if (json.hasOwnProperty('signer_id')) {
      signerId = json.signer_id
    }
    if (
      // eslint-disable-next-line no-prototype-builtins
      json.hasOwnProperty('signer_signing_key') &&
      json.signer_signing_key !== null &&
      // eslint-disable-next-line no-prototype-builtins
      json.signer_signing_key.hasOwnProperty('ed25519')
    ) {
      signingKey = json.signer_signing_key.ed25519
    }

    return Promise.resolve(
      new EAKInfo(
        json.eak,
        json.authorizer_id,
        json.authorizer_public_key.curve25519,
        signerId,
        signingKey
      )
    )
  }
}

module.exports = EAKInfo
