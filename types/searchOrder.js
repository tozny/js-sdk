const Serializable = require('./serializable')

const sortOrderWhitelist = ['ASCENDING', 'DESCENDING']

/**
 * Create a search query against Tozny Platform.
 */
class SearchOrder extends Serializable {
  constructor(sortOrder = 'ASCENDING') {
    super()
    if (sortOrderWhitelist.indexOf(sortOrder) === -1) {
      throw new Error(
        `sort_order must be one of "${sortOrderWhitelist.join('","')}"`
      )
    }
    this.sortOrder = sortOrder
  }

  /**
   * Generate a JSON.stringify-friendly version of the object
   * automatically omitting any `null` fields.
   *
   * @returns {object}
   */
  serializable() {
    let toSerialize = {
      sort_order: this.sortOrder,
    }
    return toSerialize
  }
}

module.exports = SearchOrder
