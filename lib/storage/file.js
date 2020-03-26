const { Record } = require('../../types')
const FileOperations = require('./fileOperations')
const shared = require('./shared')
const { validateResponseAsJSON } = require('../utils')

/**
 * A wrapper around file records allowing efficient operations
 *
 * When a file record is fetched, the associated file is not always needed
 * immediately. This wrapper over the file record allows for reading the file
 * after the record was originally fetched (such as from a search operation)
 * without any risk of the download URL expiring.
 */
class File {
  constructor(record, client, operations) {
    if (!(record instanceof Record) || !record.isFile) {
      throw new Error('Files must be constructed with a file record object.')
    }
    // Run a very basic duck type check here because when importing client we
    // create a circular dependency and it doesn't actually work.
    // Reality is this is an internal type that is not directly exposed for
    // construction. This check is just a little extra insurance.
    if (!client.config || !client.authenticator || !client.crypto) {
      throw new Error('Files must have access to a client instance')
    }
    if (!(operations instanceof FileOperations)) {
      throw new Error('Files must have access to a FileOperations instance')
    }
    this._record = record
    this._client = client
    this._fileOps = operations
  }

  /**
   * Gets the record contained within the File object.
   *
   * This returns a promise. When a File is constructed, the full file record
   * is not always available. IF that is the case, or if the file URL is needed
   * the record is fetched fresh, decoded, and returned. This also ensures that
   * the filesUrl is always valid when needed.
   *
   * If url is false, and the record has already been fetched, a cached version
   * is returned rather than going to the server every time.
   *
   * @param {boolean} url Whether or not to get the fileUrl for download. Default: false
   * @return {Promise<Record>} The underlying record associated with this File.
   */
  async record(url = false) {
    // update the cache if needed, or if a file URL is requested
    if (!this._record.meta.fileMeta.fileName || url) {
      const method = url ? 'files' : 'records'
      const recordResponse = await this._client.authenticator.tokenFetch(
        `${this._client.config.apiUrl}/v1/storage/${method}/${this._record.meta.recordId}`
      )
      const serializedRecord = await validateResponseAsJSON(recordResponse)
      this._record = Record.decode(serializedRecord)
    }
    return this._record
  }

  /**
   * Download and decrypts the associated file for reading.
   *
   * This returns a platform specific object. That object is usable in helpers
   * to convert it to a more standard primitive.
   *
   * @return {Promise<any>} A promise resolving to the platform specific stream
   *                        of decrypted bytes.
   */
  async read() {
    const ops = this._fileOps
    const record = await this.record(true)
    const accessKey = await shared.getAccessKey(
      this._client,
      record.meta.writerId,
      record.meta.userId,
      this._client.config.clientId,
      record.meta.type
    )
    const source = await ops.download(record.meta.fileMeta.fileUrl)
    return await this._client.crypto.decryptFile(source, accessKey, ops)
  }
}

module.exports = File
