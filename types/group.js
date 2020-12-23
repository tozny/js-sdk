const GroupMembershipKeys = require('./groupMembershipKeys')
const GroupData = require('./groupData')
const Serializable = require('./serializable')

class Group extends Serializable {
  constructor(data, membershipKeys) {
    super()
    this.groupName = data.groupName
    this.publicKey = membershipKeys.publicKey
    this.encryptedGroupKey = membershipKeys.encryptedGroupKey
    this.createdAt = null
    this.lastModified = null
    this.groupID = null
    this.accountID = null
  }

  serializable() {
    let toSerialize = {
      group_name: this.groupName,
      public_key: this.publicKey,
      encrypted_group_key: this.encryptedGroupKey,
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
    var data = {
      groupName: groupName,
    }
    let membershipKeys = GroupMembershipKeys.decode(json)
    var group = new Group(data, membershipKeys)

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
  /**
   * make a new create group request
   *
   * @param {Crypto} crypto
   * @param {string} name
   * @param {Array.<string>} capabilities
   * @param {KeyPair} encryptionKeyPair
   *
   * @returns {Promise<Group>}
   */
  static async createGroupRequest(
    crypto,
    name,
    capabilities = [],
    encryptionKeyPair
  ) {
    const groupKeyPair = await crypto.generateKeypair()
    const pk = await crypto.encryptPrivateKey(
      groupKeyPair.privateKey,
      encryptionKeyPair.privateKey,
      encryptionKeyPair.publicKey
    )
    let groupData = new GroupData(name, capabilities)
    let membershipKeys = new GroupMembershipKeys(
      encryptionKeyPair.publicKey,
      pk
    )
    let group = new Group(groupData, membershipKeys)
    return group
  }
}

module.exports = Group
