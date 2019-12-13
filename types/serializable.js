/**
 * Interface for serializable (offline-signable) documents to implement
 */
class Serializable {
  /**
   * Generate a JSON.stringify-friendly version of the object
   * automatically omitting any `null` fields.
   *
   * @returns {object}
   */
  serializable() {
    throw new Error('Object must implement serializable().')
  }

  /**
   * Serialize the object to JSON
   *
   * @returns {string}
   */
  stringify() {
    return JSON.stringify(this.serializable())
  }
}

module.exports = Serializable
