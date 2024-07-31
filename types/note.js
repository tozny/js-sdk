const NoteKeys = require('./noteKeys')
const NoteOptions = require('./noteOptions')
const EACP = require('./eacp')
const Serializable = require('./serializable')

class Note extends Serializable {
  constructor(data, noteKeys, signature, options) {
    super()
    // Required values
    this.data = data
    // Key values
    this.mode = noteKeys.mode
    this.recipientSigningKey = noteKeys.recipientSigningKey
    this.writerEncryptionKey = noteKeys.writerEncryptionKey
    this.writerSigningKey = noteKeys.writerSigningKey
    this.encryptedAccessKey = noteKeys.encryptedAccessKey
    // Verification signature
    this.signature = signature
    // Optional values
    this.options = options
    this.createdAt = null // Server defined value, not available until creation.
    this.noteId = null
  }

  serializable() {
    /* eslint-disable camelcase */
    let toSerialize = {
      data: this.data,
      mode: this.mode,
      recipient_signing_key: this.recipientSigningKey,
      writer_signing_key: this.writerSigningKey,
      writer_encryption_key: this.writerEncryptionKey,
      encrypted_access_key: this.encryptedAccessKey,
      signature: this.signature,
      type: this.options.type,
      plain: this.options.plain,
      file_meta: this.options.fileMeta,
      max_views: this.options.maxViews,
      client_id: this.options.clientId,
      id_string: this.options.idString,
      expiration: this.options.expiration,
      expires: this.options.expires,
      eacp: this.options.eacp,
      created_at: this.createdAt,
      note_id: this.noteId,
    }
    // Ensure that fileMeta is always an object, even it it's set to null
    if (this.options.fileMeta === null) {
      toSerialize.file_meta = {}
    } else {
      toSerialize.file_meta = this.options.fileMeta
    }
    /* eslint-enable */
    // Ensure that plain is always an object, even it it's set to null
    if (this.options.plain === null) {
      toSerialize.plain = {}
    } else {
      toSerialize.plain = this.options.plain
    }

    if (this.options.eacp instanceof EACP) {
      toSerialize.eacp = this.options.eacp.serializable()
    }
    const serializedKeys = Object.keys(toSerialize)
    for (const key of serializedKeys) {
      if (toSerialize[key] === null) {
        delete toSerialize[key]
      }
    }
    return toSerialize
  }

  static decode(json) {
    let data = json.data === undefined ? null : json.data
    let options = NoteOptions.decode(json)
    let noteKeys = NoteKeys.decode(json)
    let signature = json.signature === undefined ? null : json.signature
    var note = new Note(data, noteKeys, signature, options)

    // Server defined values
    let createdAt = json.created_at === null ? null : json.created_at
    let noteId = json.note_id === null ? null : json.note_id
    let file_meta = json.file_meta === undefined ? {} : json.file_meta
    note.createdAt = createdAt
    note.noteId = noteId
    note.file_meta = file_meta
    return note
  }

  static clone(note) {
    let jsonNote = note.serializable()
    let cloneNote = Note.decode(jsonNote)
    return cloneNote
  }
}

module.exports = Note
