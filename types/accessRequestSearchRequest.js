const Serializable = require('./serializable')

class AccessRequestSearchRequest extends Serializable {
  constructor(filterByRequestorIDs, filterByGroupIDs, nextToken, limit) {
    super()
    this.filterByRequestorIDs = filterByRequestorIDs
    this.filterByGroupIDs = filterByGroupIDs
    this.nextToken = nextToken
    this.limit = limit
  }

  serializable() {
    let toSerialize = {
      access_request_search_filters: {
        access_controlled_group_ids: this.filterByGroupIDs,
        requestor_ids: this.filterByRequestorIDs,
      },
      next_token: this.nextToken,
      limit: this.limit,
    }

    const serializedKeys = Object.keys(toSerialize)
    for (const key of serializedKeys) {
      if (toSerialize[key] === null) {
        delete toSerialize[key]
      }
    }
    return toSerialize
  }
  static decode(json) {
    const searchFilters =
      json.access_request_search_filters === undefined
        ? null
        : json.access_request_search_filters
    const filterByRequestorIDs =
      searchFilters === null ? [] : searchFilters.requestor_ids
    const filterByGroupIDs =
      searchFilters === null ? [] : searchFilters.access_controlled_group_ids
    const limit = json.limit === undefined ? null : json.limit
    const nextToken = json.next_token === undefined ? 0 : json.next_token

    var accessRequestSearchRequest = new AccessRequestSearchRequest(
      filterByRequestorIDs,
      filterByGroupIDs,
      limit,
      nextToken
    )

    return accessRequestSearchRequest
  }
}

module.exports = AccessRequestSearchRequest
