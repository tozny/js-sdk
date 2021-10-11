const Serializable = require('./serializable')

class AccessRequest extends Serializable {
  constructor(reason, requestorID, realmName, groups, accessDurationSeconds) {
    super()
    this.reason = reason
    this.requestorID = requestorID
    this.realmName = realmName
    this.groups = groups
    this.accessDurationSeconds = accessDurationSeconds
    this.ID = null
    this.state = null
    this.createdAt = null
    this.autoExpiresAt = null
  }

  serializable() {
    let toSerialize = {
      reason: this.reason,
      requestor_id: this.requestorID,
      realm_name: this.realmName,
      ttl: this.accessDurationSeconds,
      groups: [],
      id: this.ID,
      state: this.state,
      created_at: this.createdAt,
      auto_expires_at: this.autoExpiresAt,
    }
    let rawGroups = []
    for (const group of this.groups) {
      rawGroups.push({ group_id: group.ID })
    }
    toSerialize.groups = rawGroups
    const serializedKeys = Object.keys(toSerialize)
    for (const key of serializedKeys) {
      if (toSerialize[key] === null) {
        delete toSerialize[key]
      }
    }
    return toSerialize
  }
  static decode(json) {
    let reason = json.reason === undefined ? null : json.reason
    let requestorID = json.requestor_id === undefined ? null : json.requestor_id
    let realmName = json.realm_name === undefined ? null : json.realm_name
    let rawGroups = json.groups === undefined ? null : json.groups
    let groups = []
    for (const group of rawGroups) {
      groups.push({ ID: group.group_id })
    }
    let accessDurationSeconds = json.ttl === undefined ? null : json.ttl

    var accessRequest = new AccessRequest(
      reason,
      requestorID,
      realmName,
      groups,
      accessDurationSeconds
    )

    // server defined values
    let ID = json.id === null ? null : json.id
    let state = json.state === null ? null : json.state
    let createdAt = json.created_at === null ? null : json.created_at
    let autoExpiresAt =
      json.auto_expires_at === null ? null : json.auto_expires_at

    accessRequest.ID = ID
    accessRequest.state = state
    accessRequest.createdAt = createdAt
    accessRequest.autoExpiresAt = autoExpiresAt
    return Promise.resolve(accessRequest)
  }
}

module.exports = AccessRequest
