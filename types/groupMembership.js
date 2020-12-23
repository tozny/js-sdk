const { Group } = require('.')
const { GroupData } = require('./groupData')
const Serializable = require('./serializable')

class GroupMembership extends Serializable {
  constructor(clientID, group, membershipKey, capabilities) {
    super()
    this.clientID = clientID
    this.group = group
    this.membershipKey = membershipKey
    this.capabilities = new GroupData(null, capabilities)
  }
  serializable() {
    let toSerialize = {
      client_id: this.clientID,
      membership_key: this.membershipKey,
      capabilities: this.capabilities,
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
    let clientID = json.client_id === undefined ? null : json.client_id
    let membershipKey =
      json.membership_key === undefined ? null : json.membership_key
    let capabilities =
      json.capabilities === undefined ? null : json.capabilities
    let group = Group.decode(json)
    return new GroupMembership(clientID, group, membershipKey, capabilities)
  }
}

module.exports = GroupMembership
