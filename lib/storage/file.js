const { Record } = require('../../types')
const FileOperations = require('./fileOperations')
const shared = require('./shared')
const { validateResponseAsJSON } = require('../utils')

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

  async read() {
    const record = await this.record(true)
    const accessKey = await shared.getAccessKey(
      this._client,
      record.meta.writerId,
      record.meta.userId,
      this._client.config.clientId,
      record.meta.type
    )
    return await this._client.crypto.decryptFile(
      record.meta.fileMeta.fileUrl,
      accessKey,
      this._fileOps
    )
  }
}

module.exports = File
