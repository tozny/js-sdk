const Serializable = require('./serializable')

/**
 * Configuration for an Tozny OTP based extended access control policy.
 */
class WebAuthnEACP extends Serializable {
  /**
   * The key used to identify this EACP in a JSON object.
   *
   * @return {String} the EACP key.
   */
  static get jsonKey() {
    return 'web_authn'
  }

  /**
   * Configuration for an Tozny OTP EACP.
   *
   * @param {boolean} include A boolean to indicate that this EACP should be included
   */
  constructor(challengeId, challengeResponse) {
    super()
    this.challengeId = challengeId
    this.challengeResponse = challengeResponse
  }

  /**
   * Create a plain object representation of the Tozny OTP EACP. Used for JSON serialization.
   *
   * @return {Object} A plain JS object representing the Tozny OTP EACP configuration.
   */
  serializable() {
    /* eslint-disable camelcase */
    return {
      challengeId: this.challengeId,
      challengeResponse: this.challengeResponse,
    }
  }

  /**
   * Create a new ToznyOTPEACP instance from a Javascript object.
   *
   * @param {Object} json A plain JS object containing the needed EmailEACP configuration.
   *
   * @return {ToznyOTPEACP} The constructed EmailEACP object based on the passed JS object.
   */
  static decode(json) {
    return new WebAuthnEACP(json.challengeId, json.challengeResponse)
  }
}

module.exports = WebAuthnEACP
