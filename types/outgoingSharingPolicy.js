/**
 * Information about a specific E3DB client, including the client's
 * public key to be used for cryptographic operations.
 *
 * @property {string} readerId      Unique ID of the writer that shared with this client
 * @property {string} recordType    Type of record shared with this client
 * @property {string} [readerName]  Display name of the writer, if available
 */
class OutgoingSharingPolicy {
  constructor(readerId, recordType, readerName = null) {
    this.readerId = readerId
    this.recordType = recordType
    this.readerName = readerName
  }

  /**
   * Specify how an already unserialized JSON array should be marshaled into
   * an object representation.
   *
   * Client information contains the ID of the client, a Curve25519 public key
   * component, and a flag describing whether or not the client has been validated.
   *
   * <code>
   * isp = OutgoingSharingPolicy::decode({
   *   reader_id: '',
   *   record_type: '',
   *   reader_name: ''
   * })
   * <code>
   *
   * @param {object} json
   *
   * @return {Promise<OutgoingSharingPolicy>}
   */
  static async decode(json) {
    return Promise.resolve(
      new OutgoingSharingPolicy(
        json.reader_id,
        json.record_type,
        json.reader_name
      )
    )
  }
}

module.exports = OutgoingSharingPolicy
