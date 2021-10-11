const AccessRequest = require('./accessRequest')
const Serializable = require('./serializable')

class AccessRequestSearchResponse extends Serializable {
  constructor(accessRequests, nextToken) {
    super()
    this.accessRequests = accessRequests
    this.nextToken = nextToken
  }

  serializable() {
    let serializedAccessRequests = []
    for (const accessRequest of this.accessRequests) {
      serializedAccessRequests.push(accessRequest.serializable())
    }
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
    const rawAccessRequests =
      json.access_requests === undefined ? [] : json.access_requests
    let accessRequests = []
    for (const rawAccessRequest of rawAccessRequests) {
      let accessRequest = new AccessRequest()
      accessRequest.state = rawAccessRequest.state
      accessRequest.ID = rawAccessRequest.id
      accessRequest.reason = rawAccessRequest.reason
      accessRequest.requestorID = rawAccessRequest.requestor_id
      accessRequest.realmName = rawAccessRequest.realm_name
      accessRequest.groups = rawAccessRequest.groups.map((x) => {
        // eslint-disable-next-line no-unused-labels
        return { ID: x.group_id }
      })
      accessRequest.accessDurationSeconds = rawAccessRequest.ttl
      accessRequest.createdAt = rawAccessRequest.created_at
      accessRequest.autoExpiresAt = rawAccessRequest.auto_expires_at

      accessRequests.push(accessRequest)
    }
    const nextToken = json.next_token === undefined ? 0 : json.next_token

    const accessRequestSearchResponse = new AccessRequestSearchResponse(
      accessRequests,
      nextToken
    )

    return accessRequestSearchResponse
  }
}

module.exports = AccessRequestSearchResponse
