const Serializable = require('./serializable')

class GroupMembershipKeys extends Serializable {
  constructor(keyMaterial, authorizerPublicKey, authorizerID) {
    super()
    this.keyMaterial = keyMaterial
    this.authorizerPublicKey = authorizerPublicKey
    this.authorizerID = authorizerID
  }
  serializable() {
    let toSerialize = {
      key_material: this.keyMaterial,
      authorizer_public_key: this.authorizerPublicKey,
      authorizer_id: this.authorizerID,
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
    let keyMaterial = json.key_material === undefined ? null : json.key_material
    let authorizerPublicKey =
      json.authorizer_public_key === undefined
        ? null
        : json.authorizer_public_key
    let authorizerID =
      json.authorizer_id === undefined ? null : json.authorizer_id
    return new GroupMembershipKeys(
      keyMaterial,
      authorizerPublicKey,
      authorizerID
    )
  }
}

module.exports = GroupMembershipKeys
