const Serializable = require('./serializable')
const SearchParam = require('./searchParam')
const SearchRange = require('./searchRange')
const SearchOrder = require('./searchOrder')
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

  match(terms, condition, strategy) {
    this.matches.push(new SearchParam(terms, condition, strategy))
    return this
  }

  exclude(terms, condition, strategy) {
    this.excludes.push(new SearchParam(terms, condition, strategy))
    return this
  }

  range(start, end, key) {
    this.searchRange = new SearchRange(start, end, key)
    return this
  }
  order(sortOrder) {
    this.searchOrder = new SearchOrder(sortOrder)
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
      include_all_writers: this.includeAllWriters,
      include_data: this.includeData,
    }
    if (this.nextToken) {
      toSerialize.next_token = this.nextToken
    }
    if (this.matches.length > 0) {
      toSerialize.match = this.matches.map((m) => m.serializable())
    }
    if (this.excludes.length > 0) {
      toSerialize.exclude = this.excludes.map((e) => e.serializable())
    }
    if (this.searchRange) {
      toSerialize.range = this.searchRange.serializable()
    }
    if (this.searchOrder) {
      toSerialize.order = this.searchOrder.serializable()
    }
    return toSerialize
  }
}

module.exports = Search
