module.exports = {
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
      return true
    } catch (_) {
      return false
    }
  },
}
