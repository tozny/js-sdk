const Serializable = require('./serializable')
const { DEFAULT_QUERY_COUNT } = require('../lib/utils/constants')

/**
 * Describe a query request against the E3DB API.
 */
class Query extends Serializable {
  constructor(
    afterIndex = 0,
    includeData = false,
    writerIds = null,
    recordIds = null,
    contentTypes = null,
    plain = null,
    userIds = null,
    count = DEFAULT_QUERY_COUNT,
    includeAllWriters = false
  ) {
    super()

    this.afterIndex = afterIndex
    this.includeData = includeData
    this.writerIds = writerIds
    this.recordIds = recordIds
    this.contentTypes = contentTypes
    this.userIds = userIds
    this.count = count
    this.includeAllWriters = includeAllWriters

    if (writerIds instanceof Array) {
      this.writerIds = writerIds
    } else if (writerIds !== null) {
      this.writerIds = [writerIds]
    }

    if (recordIds instanceof Array) {
      this.recordIds = recordIds
    } else if (recordIds !== null) {
      this.recordIds = [recordIds]
    }

    if (contentTypes instanceof Array) {
      this.contentTypes = contentTypes
    } else if (contentTypes !== null) {
      this.contentTypes = [contentTypes]
    }

    if (userIds instanceof Array) {
      this.userIds = userIds
    } else if (userIds !== null) {
      this.userIds = [userIds]
    }

    if (typeof plain === 'object') {
      this.plain = plain
    } else {
      this.plain = null
    }
  }

  /**
   * Generate a JSON.stringify-friendly version of the object
   * automatically omitting any `null` fields.
   *
   * @returns {object}
   */
  serializable() {
    let toSerialize = {}

    if (this.count !== null) {
      toSerialize.count = this.count
    }
    if (this.includeData !== null) {
      toSerialize.include_data = Boolean(this.includeData)
    }
    if (this.writerIds !== null && this.writerIds.length > 0) {
      toSerialize.writer_ids = this.writerIds
    }
    if (this.userIds !== null && this.userIds.length > 0) {
      toSerialize.user_ids = this.userIds
    }
    if (this.recordIds !== null && this.recordIds.length > 0) {
      toSerialize.record_ids = this.recordIds
    }
    if (this.contentTypes !== null && this.contentTypes.length > 0) {
      toSerialize.content_types = this.contentTypes
    }
    if (this.plain !== null) {
      toSerialize.plain = this.plain
    }
    if (this.afterIndex !== null) {
      toSerialize.after_index = this.afterIndex
    }
    if (this.includeAllWriters !== null) {
      toSerialize.include_all_writers = Boolean(this.includeAllWriters)
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
}

module.exports = Query
