const Serializable = require('./serializable')
const FileMeta = require('./fileMeta')

/**
 * Describe the meta information attributed to a specific encrypted record.
 *
 * @property {string} recordId     Unique ID of the record, or `null` if not yet written
 * @property {string} writerId     Unique ID of the writer of the record
 * @property {string} userId       Unique ID of the subject/user the record is about
 * @property {string} type         Free-form description of thr record content type
 * @property {object} plain        Map of String->String values describing the record's plaintext meta
 * @property {Date}   created      When this record was created, or `null` if unavailable.
 * @property {Date}   lastModified When this record last changed, or `null` if unavailable.
 * @property {string} version      Opaque version identifier created by the server on changes.
 */
class Meta extends Serializable {
  constructor(writerId, userId, type, plain) {
    super()

    this.recordId = null
    this.writerId = writerId
    this.userId = userId
    this.type = type
    this.plain = plain
    this.created = null
    this.lastModified = null
    this.version = null
    this.fileMeta = null
  }

  /* eslint-disable camelcase */

  /**
   * Generate a JSON.stringify-friendly version of the object
   * automatically omitting any `null` fields.
   *
   * @returns {object}
   */
  serializable() {
    let toSerialize = {
      record_id: this.recordId,
      writer_id: this.writerId,
      user_id: this.userId,
      type: this.type,
      created: this.created,
      last_modified: this.lastModified,
      version: this.version,
    }

    // Ensure that plain is always an object, even it it's set to null
    if (this.plain === null) {
      toSerialize.plain = {}
    } else {
      toSerialize.plain = this.plain
    }

    // If file meta is present, serialize it
    if (this.fileMeta instanceof FileMeta) {
      toSerialize.file_meta = this.fileMeta.serializable()
    }

    for (let key in toSerialize) {
      // eslint-disable-next-line no-prototype-builtins
      if (toSerialize.hasOwnProperty(key)) {
        if (toSerialize[key] === null) {
          delete toSerialize[key]
        }
      }
    }

    return toSerialize
  }

  /* eslint-enable */

  /**
   * Specify how an already unserialized JSON array should be marshaled into
   * an object representation.
   *
   * Meta objects consist of both mutable and immutable information describing
   * the record to which they're attached. Ownership, type, and datetime information
   * is fixed and only updated by the server, but the plaintext fields attributed
   * to a record can be controlled by the user. This mutable field is a map of
   * strings to strings (a JSON object) and is stored in plaintext on the
   * server. The array expected for deserializing back into an object requires:
   *
   * <code>
   * const meta = Meta.decode({
   *   writer_id: '',
   *   record_id: '',
   *   user_id: '',
   *   type: '',
   *   plain: {},
   *   created: '',
   *   last_modified: '',
   *   version: '',
   *   file_meta: {} // or null/undefined
   * });
   * </code>
   *
   * @param {object} json
   *
   * @return {Promise<Meta>}
   */
  static decode(json) {
    let meta = new Meta(json.writer_id, json.user_id, json.type, json.plain)

    if (json.created === undefined || json.created === null) {
      meta.created = null
    } else {
      meta.created = new Date(json.created)
    }
    if (json.last_modified === undefined || json.last_modified === null) {
      meta.lastModified = null
    } else {
      meta.lastModified = new Date(json.last_modified)
    }

    if (typeof json.file_meta !== 'object') {
      meta.fileMeta = null
    } else {
      meta.fileMeta = FileMeta.decode(json.file_meta)
    }

    meta.recordId = json.record_id || null
    meta.version = json.version || null

    return Promise.resolve(meta)
  }
}

module.exports = Meta
