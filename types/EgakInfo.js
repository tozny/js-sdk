const PublicKey = require('./publicKey')
const AccessKeyWrapper = require('./accessKeyWrapper')
const Serializable = require('./serializable')
//const SigningKey = require('./signingKey')

/**
 * Representation of a group encrypted access key
 *
 * @property {string} eak
 * @property {string} authorizerID
 * @property {string} authorizerPublicKey
 * @property {object} accessKeyWrappers
 *
 */
class EGAKInfo extends Serializable {
  constructor(
    eak,
    authorizerID,
    authorizerPublicKey,
    accessKeyWrappers
  ) {
    super()
    this.eak = eak
    this.authorizerID = authorizerID
    this.authorizerPublicKey = new PublicKey(authorizerPublicKey)
    this.accessKeyWrappers = []
    for (let AK of accessKeyWrappers) {
        this.accessKeyWrappers.push(new AccessKeyWrapper(AK))
    }
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
      access_key_wrappers: this.accessKeyWrappers,
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
   *   'access_key_wrappers'   => '',
   * });
   * </code>
   *
   * @param {object} json
   *
   * @return {Promise<GroupEAKInfo>}
   */
  static async decode(json) {
    return Promise.resolve(
      new EGAKInfo(
        json.eak,
        json.authorizer_id,
        json.authorizer_public_key.curve25519,
        json.access_key_wrappers,
      )
    )
  }
}

module.exports = EGAKInfo
