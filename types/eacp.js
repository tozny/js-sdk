const Serializable = require('./serializable')
const EmailEACP = require('./emailEACP')
const LastAccessEACP = require('./lastAccessEACP')

/**
 * EACP defines the various extended access control policies on data object.
 *
 * The EACP types are hard coded, and each data object can have one of each
 * kind. These are defined in sub objects. The EACP object is to mix all of the
 * various kinds together so they can be sent to the server to apply the policy.
 */
class EACP extends Serializable {
  /**
   * Create an EACP instance to organize extended access control policies for data objects.
   *
   * @param {EmailEACP} emailEACP An Email EACP configuration to associate with the data object.
   * @param {LastAccessEACP} noteAccessEACP A Last Access EACP configuration to associate with the object.
   */
  constructor(emailEACP, noteAccessEACP) {
    super()

    if (emailEACP instanceof EmailEACP) {
      this.emailEACP = emailEACP
    }
    if (noteAccessEACP instanceof LastAccessEACP) {
      this.noteAccessEACP = noteAccessEACP
    }
  }

  /**
   * Create a plain object representation of the EACP. Used for JSON serialization.
   *
   * @return {Object} A plain JS object representing the EACP.
   */
  serializable() {
    let toSerialize = {}
    // Ensure that plainMeta is always an object, even it it's set to null
    for (let eacp in this) {
      // eslint-disable-next-line no-prototype-builtins
      if (!this.hasOwnProperty(eacp)) {
        continue
      }
      toSerialize[this[eacp].constructor.jsonKey] = this[eacp].serializable()
    }
    return toSerialize
  }

  /**
   * Create a new EACP instance from a Javascript object.
   *
   * @param {Object} json A plain JS object containing the needed EACP fields.
   *
   * @return {EACP} The constructed EACP object based on the passed JS object.
   */
  static decode(json) {
    let emailEACP
    let noteAccessEACP
    if (typeof json[EmailEACP.jsonKey] === 'object') {
      emailEACP = EmailEACP.decode(json[EmailEACP.jsonKey])
    }
    if (typeof json[LastAccessEACP.jsonKey] === 'object') {
      noteAccessEACP = LastAccessEACP.decode(json[LastAccessEACP.jsonKey])
    }
    return new EACP(emailEACP, noteAccessEACP)
  }
}

module.exports = EACP
