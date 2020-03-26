const { checkConstructor, notImplemented } = require('../utils/interface')

/* eslint-disable no-unused-vars */

class FileOperations {
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

  /**
   * Gets an object which fits the interface needed to collect decrypted bytes.
   *
   * @return {object} Object containing write, close, and getReader methods.
   */
  decryptDestination() {
    notImplemented()
  }

  /**
   * Gets an object which fits the interface needed to store encrypted bytes.
   *
   * @return {object} Object containing write, remove, and getUploadable methods.
   */
  encryptDestination() {
    notImplemented()
  }

  /**
   * Gets an object which knows how to read the underlying platform specific file handle.
   *
   * @param {any} handle The platform specific file handle
   * @param {number} blockSize The number of block to return on each read()
   */
  sourceReader(handle, blockSize) {
    notImplemented()
  }

  /**
   * Platform specific download to allow streaming processing of the bytes
   *
   * @param {string} url The URL where the object is available for download
   */
  async download(url) {
    notImplemented()
  }

  /**
   * Platform specific upload allowing streaming upload of the bytes
   * @param {string} url The URL where the object can be uploaded
   * @param {any} body The platform specific body object
   * @param {string} checksum A base64 encoded md5 of the body bytes
   * @param {number} size The total number of body bytes
   */
  async upload(url, body, checksum, size) {
    notImplemented()
  }
}

module.exports = FileOperations
