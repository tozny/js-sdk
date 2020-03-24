const {
  isExtension,
  checkConstructor,
  notImplemented,
} = require('../utils/interface')

/* eslint-disable no-unused-vars */

class FileOperations {
  static isExtension(crypto) {
    return isExtension(crypto, FileOperations)
  }

  constructor() {
    checkConstructor(this, FileOperations)
  }

  /**
   * validateHandle ensures the correct platform specific file handle is provided.
   *
   * @param {any} fileHandle The file handle for the platform
   * @return {undefined} returns nothing, throws if the handle is not valid
   */
  validateHandle(handle) {
    notImplemented()
  }

  getTempFileForWrite() {
    notImplemented()
  }

  uploadFile(url, tempFile) {
    notImplemented()
  }

  /**
   * gets access to a streaming file handle for downloading a file.
   */
  download() {
    notImplemented()
  }
}

module.exports = FileOperations
