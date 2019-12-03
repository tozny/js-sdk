const EAKInfo = require('./eakInfo')
const Meta = require('./meta')
const Record = require('./record')

/**
 * Describe a query result returned from E3DB API.
 */
class SearchResult {
  constructor(client, searchRequest) {
    this.client = client
    this.request = searchRequest
    this.done = false
    this.totalResults = -1
  }

  /**
   * Get the next page of results from the current query
   *
   * @returns {Promise<array>}
   */
  async next() {
    // Finished iteration, exit early
    if (this.done) {
      return []
    }

    let response = await this.client._search(this.request)
    // If we've reached the last page, keep track and exit
    if (response.results.last_index === 0) {
      this.done = true
      return []
    }

    /* eslint-disable */
    let records = await Promise.all(
      response.results.map(async result => {
        const meta = await Meta.decode(result.meta)
        const record = new Record(meta, result.record_data)
        if (query.includeData && result.access_key !== null) {
          const eak = await EAKInfo.decode(result.access_key)
          const ak = await this.client.crypto.decryptEak(
            this.client.config.privateKey,
            eak
          )
          return this.client.crypto.decryptRecord(record, ak)
        }

        return record
      })
    )

    this.request.nextToken = response.last_index
    this.totalResults = response.total_results
    if (response.search_id) {
      this.searchId = response.search_id
    }
    if (records.length < this.request.count) {
      this.done = true
    }

    return records
  }
}

module.exports = SearchResult
