const Serializable = require('./serializable')

const keyWhitelist = ['CREATED', 'MODIFIED']

/**
 * Create a search query against Tozny Platform.
 */
class SearchRange extends Serializable {
  constructor(start, end, key = 'CREATED') {
    super()
    if (keyWhitelist.indexOf(key) === -1) {
      throw new Error(`key must one of "${keyWhitelist.join('", "')}"`)
    }
    if (!(start instanceof Date)) {
      throw new Error('start must be an instance of Date')
    }
    if (!(end instanceof Date)) {
      throw new Error('end must be an instance of Date')
    }

    this.key = key
    this.start = start
    this.end = end
  }

  /**
   * Generate a JSON.stringify-friendly version of the object
   * automatically omitting any `null` fields.
   *
   * @returns {object}
   */
  serializable() {
    let toSerialize = {
      range_key: this.key,
      before: this.start.toISOString(),
      after: this.end.toISOString(),
    }
    return toSerialize
  }
}

module.exports = SearchRange
