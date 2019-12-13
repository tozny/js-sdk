const Platform = require('../lib/crypto/platform')

class NodePlatform extends Platform {
  b64encode(raw) {
    return Buffer.from(raw).toString('base64')
  }

  b64decode(encoded) {
    return Buffer.from(encoded, 'base64')
  }

  b64URLDecode(encoded) {
    return this.b64decode(encoded)
  }

  b64URLEncode(raw) {
    return Buffer.from(raw)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  }

  byteToUTF8String(field) {
    return Buffer.from(field).toString('utf8')
  }

  UTF8StringToByte(byteArray) {
    return Buffer.from(byteArray)
  }
}

module.exports = NodePlatform
