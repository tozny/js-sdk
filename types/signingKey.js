/**
 * Describe an Ed25519 public key for use in Sodium-powered signing
 * operations.
 *
 * @property {string} ed25519 Public component of the Ed25519 key.
 */
class SigningKey {
  constructor(ed25519) {
    this.ed25519 = ed25519
  }

  /**
   * Specify how an already unserialized JSON array should be marshaled into
   * an object representation.
   *
   * The public key component of a Ed25519 key alone is serialized for transmission
   * between various parties.
   *
   * <code>
   * key = SigningKey::decode({
   *   ed25519: ''
   * })
   * </code>
   *
   * @param {object} json
   *
   * @return {Promise<SigningKey>}
   */
  static decode(json) {
    let key = new SigningKey(json.ed25519)

    return Promise.resolve(key)
  }
}

module.exports = SigningKey
