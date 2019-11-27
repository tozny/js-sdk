const Serializable = require('./serializable')

class NoteKeys extends Serializable {
  constructor(
    mode,
    recipientSigningKey,
    writerSigningKey,
    writerEncryptionKey,
    encryptedAccessKey
  ) {
    super()
    this.mode = mode
    this.recipientSigningKey = recipientSigningKey
    this.writerSigningKey = writerSigningKey
    this.writerEncryptionKey = writerEncryptionKey
    this.encryptedAccessKey = encryptedAccessKey
  }

  serializable() {
    /* eslint-disable camelcase */
    let toSerialize = {
      mode: this.mode,
      recipient_signing_key: this.recipientSigningKey,
      writer_signing_key: this.writerSigningKey,
      writer_encryption_key: this.writerEncryptionKey,
      encrypted_access_key: this.encryptedAccessKey,
    }
    /* eslint-enabled */

    const serializedKeys = Object.keys(toSerialize)
    for (const key of serializedKeys) {
      if (toSerialize[key] === null) {
        delete toSerialize[key]
      }
    }
    return toSerialize
  }

  static decode(json) {
    let mode = json.mode === undefined ? null : json.mode
    let recipientSigningKey =
      json.recipient_signing_key === undefined
        ? null
        : json.recipient_signing_key
    let writerSigningKey =
      json.writer_signing_key === undefined ? null : json.writer_signing_key
    let writerEncryptionKey =
      json.writer_encryption_key === undefined
        ? null
        : json.writer_encryption_key
    let encryptedAccessKey =
      json.encrypted_access_key === undefined ? null : json.encrypted_access_key
    return new NoteKeys(
      mode,
      recipientSigningKey,
      writerSigningKey,
      writerEncryptionKey,
      encryptedAccessKey
    )
  }
}

module.exports = NoteKeys
