/**
 * Describe a Curve25519 public key for use in Sodium-powered cryptographic
 * operations.
 *
 * @property {string} curve25519 Public component of the Curve25519 key.
 */
class PublicKey {
  constructor(curve25519) {
    this.curve25519 = curve25519
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
    let key = new PublicKey(json.curve25519)

    return Promise.resolve(key)
  }
}

module.exports = PublicKey
