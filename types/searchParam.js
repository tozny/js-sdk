const Serializable = require('./serializable')

const conditionWhitelist = ['OR', 'AND']
const strategyWhitelist = ['EXACT', 'FUZZY', 'WILDCARD', 'REGEXP']
const termKeys = {
  writers: 'writer_ids',
  users: 'user_ids',
  records: 'record_ids',
  type: 'content_types',
  keys: 'keys',
  values: 'values',
  plain: 'tags',
}

/**
 * Create a search query against Tozny Platform.
 */
class SearchParam extends Serializable {
  constructor(terms, condition = 'OR', strategy = 'EXACT') {
    super()
    if (conditionWhitelist.indexOf(condition) === -1) {
      throw new Error(
        `condition must one of "${conditionWhitelist.join('", "')}"`
      )
    }
    if (strategyWhitelist.indexOf(strategy) === -1) {
      throw new Error(
        `strategy must one of "${strategyWhitelist.join('", "')}"`
      )
    }
    this.condition = condition
    this.strategy = strategy
    for (let key in termKeys) {
      if (typeof terms[key] === 'string') {
        this[key] = [terms[key]]
      } else if (
        Array.isArray(terms[key]) &&
        terms[key].every(t => typeof t === 'string')
      ) {
        this[key] = terms[key]
      } else {
        throw new Error(
          `unable to add ${key} to search parameters since it was not a string or array.`
        )
      }
    }
  }

  /**
   * Generate a JSON.stringify-friendly version of the object
   * automatically omitting any `null` fields.
   *
   * @returns {object}
   */
  serializable() {
    let toSerialize = {
      condition: this.condition,
      strategy: this.strategy,
      terms: {},
    }
    for (let key in termKeys) {
      if (Array.isArray(this[key])) {
        toSerialize.terms[termKeys[key]] = this[key]
      }
    }

    return toSerialize
  }
}

module.exports = SearchParam
