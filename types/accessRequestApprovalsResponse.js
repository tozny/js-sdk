const AccessRequest = require('./accessRequest')
const Serializable = require('./serializable')

class AccessRequestApprovalsResponse extends Serializable {
  static async decode(json) {
    const rawAccessRequests = json.access_requests || []
    let accessRequests = []

    for await (const rawAccessRequest of rawAccessRequests) {
      const accessRequest = await AccessRequest.decode(rawAccessRequest)
      accessRequests.push(accessRequest)
    }

    const accessRequestSearchResponse = new AccessRequestApprovalsResponse(
      accessRequests
    )

    return accessRequestSearchResponse
  }
}

module.exports = AccessRequestApprovalsResponse
