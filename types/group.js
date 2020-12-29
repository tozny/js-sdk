const Serializable = require('./serializable')

class Group extends Serializable {
  constructor(groupName, publicKey) {
    super()
    this.groupName = groupName
    this.publicKey = publicKey
    this.createdAt = null
    this.lastModified = null
    this.groupID = null
    this.accountID = null
  }

  serializable() {
    let toSerialize = {
      group_name: this.groupName,
      public_key: this.publicKey,
      group_id: this.groupID,
      account_id: this.accountID,
      created_at: this.createdAt,
      last_modified: this.lastModified,
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
    let groupName = json.group_name === undefined ? null : json.group_name
    let publicKey = json.public_key === undefined ? null : json.public_key
    var group = new Group(groupName, publicKey)

    // server defined values
    let createdAt = json.created_at === null ? null : json.created_at
    let lastModified = json.last_modified === null ? null : json.last_modified
    let groupID = json.group_id === null ? null : json.group_id
    let accountID = json.account_id === null ? null : json.account_id
    group.createdAt = createdAt
    group.lastModified = lastModified
    group.groupID = groupID
    group.accountID = accountID
    return group
  }
}

module.exports = Group
