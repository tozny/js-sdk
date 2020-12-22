const { GroupData } = require('./groupData')
const Serializable = require('./serializable')

class Membership extends Serializable {
  constructor(clientID, membershipKey, capabilities) {
    super()
    this.clientID = clientID
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
    return new Membership(clientID, membershipKey, capabilities)
  }
}

module.exports = Membership
