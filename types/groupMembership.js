const Capabilities = require('./capabilities')
const Group = require('./group')
const Serializable = require('./serializable')

class GroupMembership extends Serializable {
  constructor(clientID, group, capabilities) {
    super()
    this.clientID = clientID
    this.group = group
    this.capabilities = Capabilities.toObject(capabilities)
  }
  serializable() {
    let toSerialize = {
      client_id: this.clientID,
      group: this.group.stringify(),
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
    let group = Group.decode(json.group)
    return new GroupMembership(clientID, group, capabilities)
  }
}

module.exports = GroupMembership
