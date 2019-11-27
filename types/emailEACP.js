const Serializable = require('./serializable')

/**
 * Configuration for an email based extended access control policy.
 */
class EmailEACP extends Serializable {
  /**
   * The key used to identify this EACP in a JSON object.
   *
   * @return {String} the EACP key.
   */
  static get jsonKey() {
    return 'email_eacp'
  }

  /**
   * Configuration for an email based OTP EACP.
   *
   * @param {string} email The email address to send the otp challenge to.
   * @param {string} template The notification service email template to use when sending the challenge.
   * @param {string} providerLink The URL of the endpoint that will handle the challenge when linked to in the email.
   */
  constructor(email, template, providerLink) {
    super()
    this.emailAddress = email
    this.template = template
    this.provideLink = providerLink
  }

  /**
   * Create a plain object representation of the email EACP. Used for JSON serialization.
   *
   * @return {Object} A plain JS object representing the email EACP configuration.
   */
  serializable() {
    /* eslint-disable camelcase */
    let toSerialize = {
      email_address: this.emailAddress,
      template: this.template,
      provider_link: this.provideLink,
    }
    /* eslint-enable */
    return toSerialize
  }

  /**
   * Create a new EmailEACP instance from a Javascript object.
   *
   * @param {Object} json A plain JS object containing the needed EmailEACP configuration.
   *
   * @return {EmailEACP} The constructed EmailEACP object based on the passed JS object.
   */
  static decode(json) {
    return new EmailEACP(json.email_address, json.template, json.provider_link)
  }
}

module.exports = EmailEACP
