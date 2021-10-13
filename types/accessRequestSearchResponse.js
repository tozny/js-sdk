const AccessRequest = require('./accessRequest')
const Serializable = require('./serializable')

class AccessRequestSearchResponse extends Serializable {
  constructor(accessRequests, nextToken) {
    super()
    this.accessRequests = accessRequests
    this.nextToken = nextToken
  }

  serializable() {
    const serializedAccessRequests = this.accessRequests.map((ar) =>
      ar.serializable()
    )
    let toSerialize = {
      access_requests: serializedAccessRequests,
      next_token: this.nextToken,
    }
    const serializedKeys = Object.keys(toSerialize)
    for (const key of serializedKeys) {
      if (toSerialize[key] === null) {
        delete toSerialize[key]
      }
    }
    return toSerialize
  }
  static async decode(json) {
    const rawAccessRequests = json.access_requests || []
    let accessRequests = []
    for await (const rawAccessRequest of rawAccessRequests) {
      const accessRequest = await AccessRequest.decode(rawAccessRequest)
      accessRequests.push(accessRequest)
    }
    const nextToken = json.next_token || 0

    const accessRequestSearchResponse = new AccessRequestSearchResponse(
      accessRequests,
      nextToken
    )

    return accessRequestSearchResponse
  }
}

module.exports = AccessRequestSearchResponse
