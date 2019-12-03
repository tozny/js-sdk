const Serializable = require('./serializable')
const SearchParam = require('./searchParam')
const SearchRange = require('./searchRange')
const { DEFAULT_QUERY_COUNT } = require('../lib/utils/constants')

/**
 * Create a search query against Tozny Platform.
 */
class Search extends Serializable {
  constructor(
    includeData = false,
    includeAllWriters = false,
    count = DEFAULT_QUERY_COUNT,
    nextToken
  ) {
    super()
    this.includeData = includeData
    this.includeAllWriters = includeAllWriters
    this.count = count
    this.nextToken = nextToken
    this.matches = []
    this.excludes = []
  }

  match(condition, strategy, terms) {
    this.matches.push(new SearchParam(terms, condition, strategy))
    return this
  }

  exclude(condition, strategy, terms) {
    this.excludes.push(new SearchParam(terms, condition, strategy))
    return this
  }

  range(key, start, end) {
    this.range = new SearchRange(key, start, end)
    return this
  }

  /**
   * Generate a JSON.stringify-friendly version of the object
   * automatically omitting any `null` fields.
   *
   * @returns {object}
   */
  serializable() {
    let toSerialize = {
      limit: this.count,
      next_token: this.nextToken,
      include_all_writers: this.includeAllWriters,
      include_data: this.includeData,
    }
    if (this.matches.length > 1) {
      toSerialize.match = this.matches.map(m => m.serializable())
    }
    if (this.excludes.length > 1) {
      toSerialize.exclude = this.excludes.map(e => e.serializable())
    }
    if (this.range) {
      toSerialize.range = this.range.serializable()
    }
    return toSerialize
  }
}

module.exports = Search
