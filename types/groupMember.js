const Capabilities = require('./capabilities')
const Serializable = require('./serializable')

class GroupMember extends Serializable {
  constructor(clientID, membershipKey, capabilities) {
    super()
    this.clientID = clientID
    this.membershipKey = membershipKey
    this.capabilities = Capabilities.toObject(capabilities)
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
    let capabilities = Capabilities.toArray(json.capabilities)
    return new GroupMember(clientID, membershipKey, capabilities)
  }
}
module.exports = GroupMember
