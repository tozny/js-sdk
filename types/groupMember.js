const Capabilities = require('./capabilities')
const Serializable = require('./serializable')

class GroupMember extends Serializable {
  constructor(clientID, capabilities) {
    super()
    this.clientID = clientID
    this.membershipKey = null
    this.capabilities = Capabilities.toArray(capabilities)
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
    let capabilities = Capabilities.toArray(json.capabilities)
    var member = new GroupMember(clientID, capabilities)

    // server defined
    let membershipKeyDefined =
      json.membership_key === undefined ? null : json.membership_key

    member.membershipKey = membershipKeyDefined
    return member
  }
}
module.exports = GroupMember
