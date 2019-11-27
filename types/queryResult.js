const EAKInfo = require('./eakInfo')
const Meta = require('./meta')
const Record = require('./record')

/**
 * Describe a query result returned from E3DB API.
 */
class QueryResult {
  constructor(client, query) {
    this.afterIndex = 0
    this.client = client
    this.query = query
    this.done = false
  }

  /**
   * Get the next page of results from the current query
   *
   * @returns {Promise<array>}
   */
  async next() {
    // Finished iteration, exit early
    if (this.done) {
      return Promise.resolve([])
    }

    let query = this.query
    query.afterIndex = this.afterIndex

    let response = await this.client._query(query)
    // If we've reached the last page, keep track and exit
    if (response.results.length === 0) {
      this.done = true
      return Promise.resolve([])
    }

    /* eslint-disable */
    let records = await Promise.all(
      response.results.map(async result => {
        let meta = await Meta.decode(result.meta)
        let record = new Record(meta, result.record_data)
        if (query.includeData && result.access_key !== null) {
          let eak = await EAKInfo.decode(result.access_key)
          let ak = await this.client.crypto.decryptEak(
            this.client.config.privateKey,
            eak
          )
          return this.client.crypto.decryptRecord(record, ak)
        }

        return Promise.resolve(record)
      })
    )
    /* eslint-enable */

    this.afterIndex = response.last_index

    return Promise.resolve(records)
  }
}

module.exports = QueryResult
