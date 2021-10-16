const Serializable = require('./serializable')

class AccessRequest extends Serializable {
  constructor(reason, requestorId, realmName, groups, accessDurationSeconds) {
    super()
    this.reason = reason
    this.requestorId = requestorId
    this.realmName = realmName
    this.groups = groups
    this.accessDurationSeconds = accessDurationSeconds
    this.id = null
    this.state = null
    this.createdAt = null
    this.autoExpiresAt = null
  }

  serializable() {
    let toSerialize = {
      reason: this.reason,
      requestor_id: this.requestorId,
      realm_name: this.realmName,
      ttl: this.accessDurationSeconds,
      groups: [],
      id: this.id,
      state: this.state,
      created_at: this.createdAt,
      auto_expires_at: this.autoExpiresAt,
    }
    let rawGroups = []
    for (const group of this.groups) {
      rawGroups.push({ group_id: group.id })
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
    let reason = json.reason || null
    let requestorId = json.requestor_id || json.requestorId || null
    let realmName = json.realm_name || json.realmName || null
    let accessDurationSeconds = json.ttl || json.accessDurationSeconds || null
    let rawGroups = json.groups || []
    let groups = []
    for (const group of rawGroups) {
      groups.push({
        id: group.group_id || group.id || null,
        groupName: group.group_name || group.groupName || null,
      })
    }

    const accessRequest = new AccessRequest(
      reason,
      requestorId,
      realmName,
      groups,
      accessDurationSeconds
    )

    // server defined values
    let id = json.id || null
    let state = json.state || null
    let createdAt = json.created_at || null
    let autoExpiresAt = json.auto_expires_at || null

    accessRequest.id = id
    accessRequest.state = state
    accessRequest.createdAt = createdAt
    accessRequest.autoExpiresAt = autoExpiresAt
    return Promise.resolve(accessRequest)
  }
}

module.exports = AccessRequest
