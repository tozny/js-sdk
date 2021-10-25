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
    this.requestor = null
    this.requiredApprovalsCount = null
    this.actions = []
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
    const reason = json.reason || null
    const requestorId = json.requestor_id || json.requestorId || null
    const realmName = json.realm_name || json.realmName || null
    const accessDurationSeconds = json.ttl || json.accessDurationSeconds || null
    const rawGroups = json.groups || []
    // decode groups
    const groups = rawGroups.map((group) => ({
      id: group.group_id || group.id || null,
      groupName: group.group_name || group.groupName || null,
    }))

    const accessRequest = new AccessRequest(
      reason,
      requestorId,
      realmName,
      groups,
      accessDurationSeconds
    )

    // server defined values
    Object.assign(accessRequest, {
      id: json.id || null,
      state: json.state || null,
      createdAt: json.created_at || null,
      autoExpiresAt: json.auto_expires_at || null,
      requiredApprovalsCount: json.required_approval_count,
      requestor: AccessRequest._decodeUserDetails(json.requestor_details || {}),
      actions: (json.actions || []).map((action) => ({
        user: AccessRequest._decodeUserDetails(action.user_details || {}),
        takenAt: action.taken_at || null,
        action: action.action || null,
        comment: action.comment || '',
      })),
    })

    return accessRequest
  }

  static _decodeUserDetails(details) {
    return {
      toznyId: details.tozny_id,
      username: details.username,
    }
  }
}

module.exports = AccessRequest
