const Serializable = require('./serializable')

/**
 * Configuration for an extended access control policy based on the last access time of another note.
 */
class TozIDEACP extends Serializable {
  /**
   * The key used to identify this EACP in a JSON object.
   *
   * @return {String} the EACP key.
   */
  static get jsonKey() {
    return 'tozid_eacp'
  }

  /**
   * Configuration for a tozny ID token based EACP.
   *
   * @param {string} realmName The name of the realm the token should associate with
   */
  constructor(realmName) {
    super()
    this.realmName = realmName
  }

  /**
   * Create a plain object representation of the TozID EACP. Used for JSON serialization.
   *
   * @return {Object} A plain JS object representing the TozID EACP configuration.
   */
  serializable() {
    /* eslint-disable camelcase */
    return {
      realm_name: this.realmName,
    }
    /* eslint-enable */
  }

  /**
   * Create a new TozIDEACP instance from a Javascript object.
   *
   * @param {Object} json A plain JS object containing the needed TozIDEACP configuration.
   *
   * @return {LastAccessEACP} The constructed TozIDEACP object based on the passed JS object.
   */
  static decode(json) {
    return new TozIDEACP(json.realm_name)
  }
}

module.exports = TozIDEACP
