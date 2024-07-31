const FileOperations = require('./fileOperations')
const shared = require('./shared')

class NoteFile {
    constructor(crypto, accessKey, note, operations) {
        if (!(operations instanceof FileOperations)) {
          throw new Error('Files must have access to a FileOperations instance')
        }
        this._crypto = crypto
        this._note = note
        this._fileOps = operations
        this._accessKey = accessKey
    }

    /**
   * Downloads and decrypts the associated file for reading.
   *
   * This returns a platform specific object. That object is usable in helpers
   * to convert it to a more standard primitive for your platform.
   *
   * @return {Promise<any>} A promise resolving to the platform specific stream
   *                        of decrypted bytes.
   */
  async read() {
    if (!this._note.file_meta.file_url) {
        return null
    }
    const ops = this._fileOps
    const source = await ops.download(this._note.file_meta.file_url)
    return await this._crypto.decryptFile(source, this._accessKey, ops)
  }

}

module.exports = NoteFile