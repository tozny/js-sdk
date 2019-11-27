const Signable = require('./signable')

/**
 * Represents a signed string
 *
 * @property {string} value
 */
class SignedString extends Signable {
  constructor(value) {
    super()

    this.value = value
  }

  /**
   * Serialize the object to JSON
   *
   * @returns {string}
   */
  stringify() {
    return this.value
  }
}

module.exports = SignedString
