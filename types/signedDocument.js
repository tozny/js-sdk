const Signable = require('./signable')

/**
 * Represents a signed document with an attached signature
 *
 * @property {Serializable} document
 * @property {string}       signature
 */
class SignedDocument extends Signable {
  constructor(document, signature) {
    super()

    this.document = document
    this.signature = signature
  }

  /**
   * Generate a JSON.stringify-friendly version of the object
   * automatically omitting any `null` fields.
   *
   * @returns {object}
   */
  serializable() {
    let toSerialize = {
      doc: this.document,
      sig: this.signature,
    }

    return toSerialize
  }

  /**
   * Specify how an already unserialized JSON array should be marshaled into
   * an object representation.
   *
   * <code>
   * signedDocument = SignedDocument.decode({
   *   'doc': {},
   *   'sig': {}
   * })
   * </code>
   *
   * @param {object} json
   *
   * @return {Promise<SignedDocument>}
   */
  static decode(json) {
    let signedDocument = new SignedDocument(json.doc, json.sig)

    return Promise.resolve(signedDocument)
  }
}

module.exports = SignedDocument
