const Serializable = require('./serializable')

class GroupMembershipKeys extends Serializable {
  constructor(publicKey, encryptedGroupKey) {
    super()
    this.publicKey = publicKey
    if (encryptedGroupKey) {
      this.encryptedGroupKey = encryptedGroupKey
    }
  }
  serializable() {
    let toSerialize = {
      public_key: this.publicKey,
      encrypted_group_key: this.encryptedGroupKey,
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
    let publicKey = json.public_key === undefined ? null : json.public_key
    let encryptedGroupKey =
      json.encrypted_group_key === undefined ? null : json.encrypted_group_key
    return new GroupMembershipKeys(publicKey, encryptedGroupKey)
  }
}

module.exports = GroupMembershipKeys
