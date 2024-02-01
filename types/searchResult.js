const EAKInfo = require('./eakInfo')
const EGAKInfo = require('./EgakInfo')
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
    if (response.last_index === 0) {
      this.done = true
    }

    if (!response.results) {
      return []
    }

    /* eslint-disable */
    let records = await Promise.all(
      response.results.map(async (result) => {
        const meta = await Meta.decode(result.meta)
        const record = new Record(
          meta,
          result.record_data,
          null,
          result.clients_shared_with
        )
        if (this.request.includeData) {
          if (record.isFile && result.sharing_model == 'GROUP') {
            await this.client._getCachedAk(
              meta.writerId,
              meta.userId,
              this.client.config.clientId,
              meta.type,
              result.group_access_key
            )
          }
          const ak = await this.decodeAccessKey(
            result.sharing_model,
            result.access_key,
            result.group_access_key
          )
          let decryptedRecord = this.client.crypto.decryptRecord(record, ak)
          return decryptedRecord
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

  /**
   * Uses the sharing model specified to determine what kind of access key is being used and returns
   * the decoded access key.
   *
   * @param {string} sharingModel
   * @param {object} accessKey
   * @param {object} groupsAccessKey
   * @return {Promise<EAKInfo|EGAKInfo>}
   */
  async decodeAccessKey(sharingModel, accessKey, groupsAccessKey) {
    let eak
    if (sharingModel == 'GROUP') {
      eak = await EGAKInfo.decode(groupsAccessKey)
    } else {
      eak = await EAKInfo.decode(accessKey)
    }

    return this.client.crypto.decryptEak(this.client.config.privateKey, eak)
  }
}

module.exports = SearchResult
