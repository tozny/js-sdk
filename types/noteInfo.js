const Signable = require('./signable')
const NoteKeys = require('./noteKeys')
const NoteData = require('./noteData')

/*
 * NoteInfo represents required note information that is signed before encrypting
 */
class NoteInfo extends Signable {
  constructor(data, noteKeys) {
    super()
    this.data = data
    this.noteKeys = noteKeys
  }

  serializable() {
    /* eslint-disable camelcase */
    let toSerialize = {
      data: this.data,
      note_keys: this.noteKeys.serializable(),
    }
    /* eslint-enable */

    const serializedKeys = Object.keys(toSerialize)
    for (const key of serializedKeys) {
      if (toSerialize[key] === null) {
        delete toSerialize[key]
      }
    }
    return toSerialize
  }

  static decode(json) {
    let data = new NoteData(json.data)
    let noteKeys = NoteKeys.decode(json)
    var signableNote = new NoteInfo(data, noteKeys)
    return signableNote
  }

  /**
   * SignableSubsetFromNote creates extracts static note fields into a noteInfo
   * that will create the same signature if valid.
   */
  static signableSubsetFromNote(note) {
    return NoteInfo.decode(note.serializable())
  }
}

module.exports = NoteInfo
