const Serializable = require('./serializable')

/**
 * Configuration for an extended access control policy based on the last access time of another note.
 */
class LastAccessEACP extends Serializable {
  /**
   * The key used to identify this EACP in a JSON object.
   *
   * @return {String} the EACP key.
   */
  static get jsonKey() {
    return 'last_access_eacp'
  }

  /**
   * Configuration for an email based OTP EACP.
   *
   * @param {string} lastReadNoteId The ID of the note which must be accessed
   *                                before allowing access to the protected data object.
   */
  constructor(lastReadNoteId) {
    super()
    this.lastReadNoteId = lastReadNoteId
  }

  /**
   * Create a plain object representation of the last access EACP. Used for JSON serialization.
   *
   * @return {Object} A plain JS object representing the last access EACP configuration.
   */
  serializable() {
    /* eslint-disable camelcase */
    let toSerialize = {
      last_read_note_id: this.lastReadNoteId,
    }
    /* eslint-enable */
    return toSerialize
  }

  /**
   * Create a new LastAccessEACP instance from a Javascript object.
   *
   * @param {Object} json A plain JS object containing the needed LastAccessEACP configuration.
   *
   * @return {LastAccessEACP} The constructed LastAccessEACP object based on the passed JS object.
   */
  static decode(json) {
    return new LastAccessEACP(json.last_read_note_id)
  }
}

module.exports = LastAccessEACP
