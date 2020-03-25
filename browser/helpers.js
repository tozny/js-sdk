const sodium = require('libsodium-wrappers')

const helpers = {
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
  async fileAsResponse(file, mimeType) {
    const stream = await file.read()
    return new Response(stream, {
      headers: { 'Content-Type': mimeType },
    })
  },
  async fileAsBlob(file, mimeType) {
    const response = await helpers.fileAsResponse(file, mimeType)
    return await response.blob()
  },
  async fileAsUrl(file, mimeType) {
    const blob = await helpers.fileAsBlob(file, mimeType)
    return window.URL.createObjectURL(blob)
  },
  async fileAsJSON(file) {
    const response = await helpers.fileAsResponse(file, 'application/json')
    return response.json()
  },
  async fileAsText(file) {
    const response = await helpers.fileAsResponse(file, 'text/plain')
    return response.text()
  },
  async fileAsBuffer(file) {
    const blob = await helpers.fileAsBlob(file, 'application/octet-stream')
    return blob.arrayBuffer()
  },
}

module.exports = helpers
