/**
 * Information an authorizer policy written to TozStore
 *
 * @property {string} authorizerId The Client ID controlled by the policy
 * @property {string} writerId The client ID that wrote the data controlled by the policy
 * @property {string} userId The client ID the data controlled by the policy is about
 * @property {string} recordType The record type controlled by the policy
 * @property {string} authorizedBy The Client ID that wrote the policy
 */
class AuthorizerPolicy {
  constructor(authorizerId, writerId, userId, recordType, authorizedBy) {
    this.authorizerId = authorizerId
    this.writerId = writerId
    this.userId = userId
    this.recordType = recordType
    this.authorizedBy = authorizedBy
  }

  /**
   * Specify how an already unserialized JSON array should be marshaled into
   * an object representation.
   *
   * @param {object} json
   *
   * @return {AuthorizerPolicy}
   */
  static decode(json) {
    return new AuthorizerPolicy(
      json.authorizer_id,
      json.writer_id,
      json.user_id,
      json.record_type,
      json.authorized_by
    )
  }
}

module.exports = AuthorizerPolicy
