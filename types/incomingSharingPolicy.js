/**
 * Information about a specific E3DB client, including the client's
 * public key to be used for cryptographic operations.
 *
 * @property {string} writerId      Unique ID of the writer that shared with this client
 * @property {string} recordType    Type of record shared with this client
 * @property {string} [writerName]  Display name of the writer, if available
 */
class IncomingSharingPolicy {
  constructor(writerId, recordType, writerName = null) {
    this.writerId = writerId
    this.recordType = recordType
    this.writerName = writerName
  }

  /**
   * Specify how an already unserialized JSON array should be marshaled into
   * an object representation.
   *
   * Client information contains the ID of the client, a Curve25519 public key
   * component, and a flag describing whether or not the client has been validated.
   *
   * <code>
   * isp = IncomingSharingPolicy::decode({
   *   writer_id: '',
   *   record_type: '',
   *   writer_name: ''
   * })
   * <code>
   *
   * @param {object} json
   *
   * @return {Promise<IncomingSharingPolicy>}
   */
  static async decode(json) {
    return Promise.resolve(
      new IncomingSharingPolicy(
        json.writer_id,
        json.record_type,
        json.writer_name
      )
    )
  }
}

module.exports = IncomingSharingPolicy
