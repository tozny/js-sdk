const Serializable = require('./serializable')

const keySafelist = ['CREATED', 'MODIFIED']

/**
 * Create a search query against Tozny Platform.
 */
class SearchRange extends Serializable {
  /**
   * @param {Date|string} start the start of the search range
   * @param {Date|string} end the end of the search range
   * @param {string} [key] the key to compare dates on, either "CREATED" or "MODIFIED"
   */
  constructor(start, end, key = 'CREATED') {
    super()
    if (keySafelist.indexOf(key) === -1) {
      throw new Error(`key must one of "${keySafelist.join('", "')}"`)
    }

    const parsedStart = Date.parse(start)
    const parsedEnd = Date.parse(start)
    if (isNaN(parsedStart)) {
      throw new Error(`start must be a Date: found ${start}`)
    }
    if (isNaN(parsedEnd)) {
      throw new Error(`end must be a Date: found ${end}`)
    }

    this.key = key
    this.start = new Date(start)
    this.end = new Date(end)
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
      before: this.end.toISOString(),
      after: this.start.toISOString(),
    }
    return toSerialize
  }
}

module.exports = SearchRange
