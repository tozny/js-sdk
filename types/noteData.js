const Signable = require('./signable')

/**
 * Representation of either plaintext or encrypted data encapsulated in a note.
 */
class NoteData extends Signable {
  constructor(data) {
    super()

    for (let key in data) {
      // eslint-disable-next-line no-prototype-builtins
      if (data.hasOwnProperty(key)) {
        this[key] = data[key]
      }
    }
  }
}

module.exports = NoteData
