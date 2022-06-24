/**
 * Describe a Curve25519 public key for use in Sodium-powered cryptographic
 * operations.
 *
 * @property {string} membership_key
 * @property {string} public_key
 * @property {string} access_key_id
 * @property {string} group_public_key
 *
 */
 class AccessKeyWrapper {
    constructor(accessKeyWrapper) {
        this.membership_key = accessKeyWrapper.membership_key
        this.public_key = accessKeyWrapper.public_key
        this.access_key_id = accessKeyWrapper.access_key_id
        this.group_public_key = accessKeyWrapper.group_public_key
    }

    /**
     * Specify how an already unserialized JSON array should be marshaled into
     * an object representation.
     *
     * The public key component of a Curve25519 key alone is serialized for transmission between
     * various parties.
     *
     * <code>
     * key = PublicKey::decode({
     *   curve25519: ''
     * })
     * </code>
     *
     * @param {object} json
     *
     * @return {Promise<PublicKey>}
     */
    static decode(json) {
      let key = new AccessKeyWrapper(json.access_key_wrapper)

      return Promise.resolve(key)
    }
  }

  module.exports = AccessKeyWrapper
