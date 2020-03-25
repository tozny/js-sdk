const Serializable = require('./serializable')

const keyMap = {
  fileUrl: 'file_url',
  fileName: 'file_name',
  checksum: 'checksum',
  compression: 'compression',
  size: 'size',
}

/**
 * Describe the meta information attributed to a specific encrypted record.
 *
 * @property {string} fileUrl     The signed URL where the file can be downloaded
 * @property {string} fileName    The stored object on the server (UUID)
 * @property {string} checksum    The MD5 checksum of the encrypted file
 * @property {string} compression The compression used on the file
 * @property {int}    size        The size in bytes of the encrypted file
 */
class FileMeta extends Serializable {
  constructor() {
    super()

    this.fileUrl = null
    this.fileName = null
    this.checksum = null
    this.compression = null
    this.size = null
  }

  /**
   * Generate a JSON.stringify-friendly version of the object
   * automatically omitting any `null` fields.
   *
   * @returns {object}
   */
  serializable() {
    const toSerialize = {}
    for (let key in keyMap) {
      if (this[key] !== null && this[key] !== undefined) {
        toSerialize[keyMap[key]] = this[key]
      }
    }

    return toSerialize
  }

  /**
   * Specify how an already unserialized JSON array should be marshaled into
   * an object representation.
   *
   * FileMeta object contain information about the written encrypted file. This
   * includes the file name (a UUID), a checksum, size, etc. In addition, when
   * the file is read, this includes a pre-signed URL that can be used to
   * download the encrypted file good for 5 minutes.
   *
   * <code>
   * const fileMeta = FileMeta.decode({
   *   file_url: '',
   *   file_name: '',
   *   checksum: '',
   *   compression: '',
   *   'size': 0,
   * });
   * </code>
   *
   * @param {object} obj The JS object of file meta
   *
   * @return {Promise<FileMeta>} A promise resolving to the constructed FileMeta object
   */
  static decode(obj) {
    const meta = new FileMeta()
    if (obj) {
      for (let key in keyMap) {
        if (obj[keyMap[key]] !== undefined) {
          meta[key] = obj[keyMap[key]]
        }
      }
    }

    return meta
  }
}

module.exports = FileMeta
