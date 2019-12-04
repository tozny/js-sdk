const Meta = require('./meta')
const RecordData = require('./recordData')
const Signable = require('./signable')

/**
 * A E3DB record containing data and metadata. Records are
 * a key/value mapping containing data serialized
 * into strings. All records are encrypted prior to sending them
 * to the server for storage, and decrypted in the client after
 * they are read.
 *
 * @property {Meta}       meta      Meta information about the record.
 * @property {RecordData} data      Either plaintext or encrypted record fields
 * @property {string}     signature Signature over unencrypted record data
 */
class Record extends Signable {
  constructor(meta, data, signature = null) {
    super()
    if (meta instanceof Meta) {
      this.meta = meta
    } else {
      throw new Error('Record meta must be a Meta object!')
    }
    if (data instanceof RecordData || data === null) {
      this.data = data
    } else if (typeof data === 'object') {
      this.data = new RecordData(data)
    } else {
      this.data = null
    }

    this.signature = signature
  }

  /* eslint-disable camelcase */

  /**
   * Generate a JSON.stringify-friendly version of the object
   * automatically omitting any `null` fields.
   *
   * @returns {object}
   */
  serializable() {
    const serial = {
      meta: this.meta.serializable(),
      rec_sig: this.signature,
    }
    if (this.data) {
      serial.data = this.data.serializable()
    }
    return serial
  }

  /* eslint-enabled */

  /**
   * Specify how an already unserialized JSON array should be marshaled into
   * an object representation.
   *
   * Records consist of two elements, meta and data. The array we deserialize into a Record instance
   * must match this format. The meta element is itself an array representing the Meta class. The
   * data element is a simpler array mapping string keys to either encrypted or plaintext string values.
   *
   * <code>
   * record = Record::decode({
   *   meta: {
   *     record_id:     '',
   *     writer_id:     '',
   *     user_id:       '',
   *     type:          '',
   *     plain:         {},
   *     created:       '',
   *     last_modified: '',
   *     version:       ''
   *   },
   *   data: {
   *     key1: 'value',
   *     key2: 'value'
   *   },
   *   rec_sig: ''
   * })
   * </code>
   *
   * @param {array} parsed
   *
   * @return {Promise<Record>}
   */
  static async decode(json) {
    let meta = await Meta.decode(json.meta)
    let signature = json.rec_sig === undefined ? null : json.rec_sig

    return Promise.resolve(new Record(meta, json.data, signature))
  }
}

module.exports = Record
