const Signable = require('./signable')

/* eslint-disable camelcase */

/**
 * Represents a signed, encrypted documents
 *
 * @property {object} clientMeta
 * @property {object} recordData
 */
class RecordInfo extends Signable {
  constructor(clientMeta, recordData) {
    super()

    this.clientMeta = {
      plain: clientMeta.plain,
      type: clientMeta.type,
      user_id: clientMeta.userId,
      writer_id: clientMeta.writerId,
    }
    this.recordData = recordData
  }

  /* eslint-enabled */

  /**
   * Serialize the object to JSON
   *
   * @returns {string}
   */
  stringify() {
    return JSON.stringify(this.clientMeta) + JSON.stringify(this.recordData)
  }
}

module.exports = RecordInfo
