const sodium = require('libsodium-wrappers')

const helpers = {
  /**
   * Runs a check to ensure all of the crypto primitives are available.
   *
   * @return {Promise<boolean>} A promising resolving to whether or not the primitives are available.
   */
  async checkCrypto() {
    try {
      // first detect basic subtle crypto support
      if (!window.crypto || !window.crypto.subtle) {
        return false
      }
      // next validate derive key is present
      if ('function' !== typeof window.crypto.subtle.deriveKey) {
        return false
      }

      // next check if PBKDF2 is present
      const uint8arr = new Uint8Array([20, 21, 22])
      const testKey = await window.crypto.subtle.importKey(
        'raw',
        uint8arr,
        { name: 'PBKDF2' },
        false,
        ['deriveBits', 'deriveKey']
      )
      await window.crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: uint8arr,
          iterations: 1,
          hash: 'SHA-256',
        },
        testKey,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
      )
      // finally make sure sodium is available and loaded
      // this will reject if wasm or asmjs are can not load
      await sodium.ready
      return true
    } catch (_) {
      return false
    }
  },
  /**
   * Converts a file object into a native Response object for processing.
   *
   * @param {File} file A file object ready to be read.
   * @param {string} mimeType The MIME type to assign to the file.
   * @return {Promise<Response>} A response object to process the file with.
   */
  async fileAsResponse(file, mimeType) {
    const stream = await file.read()
    return new Response(stream, {
      headers: { 'Content-Type': mimeType },
    })
  },
  /**
   * Converts a file object into a native Blob object.
   *
   * @param {File} file A file object ready to be read.
   * @param {string} mimeType The MIME type to assign to the blob.
   * @return {Promise<Blob>} A Blob object containing the decrypted file bytes.
   */
  async fileAsBlob(file, mimeType) {
    const response = await helpers.fileAsResponse(file, mimeType)
    return await response.blob()
  },
  /**
   * Converts a file object into an object URL for display or download.
   *
   * Make sure to revoke this url using `window.URL.revokeObjectURL(url)` when
   * the URL is no longer needed or you risk memory leaks.
   *
   * @param {File} file A file object ready to be read.
   * @param {string} mimeType The MIME type to assign to the file.
   * @return {Promise<string>} An object URL to the download file.
   */
  async fileAsUrl(file, mimeType) {
    const blob = await helpers.fileAsBlob(file, mimeType)
    return window.URL.createObjectURL(blob)
  },
  /**
   * Reads the decrypted file bytes and parses them as a JSON object.
   *
   * @param {File} file A file object ready to be read.
   * @return {Promise<object>} The JavaScript object represented in the file.
   */
  async fileAsJSON(file) {
    const response = await helpers.fileAsResponse(file, 'application/json')
    return response.json()
  },
  /**
   * Reads the decrypted file bytes and parses them as a UTF8 string.
   *
   * @param {File} file A file object ready to be read.
   * @return {Promise<string>} The text contained in the encrypted file.
   */
  async fileAsText(file) {
    const response = await helpers.fileAsResponse(file, 'text/plain')
    return response.text()
  },
  /**
   * Reads the decrypted file bytes into a new ArrayBuffer.
   *
   * To use the buffer, you will need to wrap in in some kind of view, such as
   * a TypedArray.
   *
   * @param {File} file A file object ready to be read.
   * @return {Promise<ArrayBuffer>} An ArrayBuffer containing the decrypted bytes.
   */
  async fileAsBuffer(file) {
    const blob = await helpers.fileAsBlob(file, 'application/octet-stream')
    return blob.arrayBuffer()
  },
}

module.exports = helpers
