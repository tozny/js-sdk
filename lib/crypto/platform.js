const {
  isExtension,
  checkConstructor,
  notImplemented,
} = require('../utils/interface')

/* eslint-disable no-unused-vars */

/**
 * Provide platform specific methods for operations such as encoding and file handling.
 */
class Platform {
  static isExtension(platform) {
    return isExtension(platform, Platform)
  }
  constructor() {
    checkConstructor(this, Platform)
  }
  byteToUTF8String(byteArray) {
    notImplemented()
  }
  UTF8StringToByte(str) {
    notImplemented()
  }
  b64encode(raw) {
    notImplemented()
  }
  b64decode(encoded) {
    notImplemented()
  }
  b64URLEncode(raw) {
    notImplemented()
  }
  b64URLDecode(encoded) {
    notImplemented()
  }
  b64encodeString(raw) {
    return this.b64encode(this.UTF8StringToByte(raw))
  }
  b64decodeString(encoded) {
    return this.byteToUTF8String(this.b64decode(encoded))
  }
  b64URLEncodeString(raw) {
    return this.b64URLEncode(this.UTF8StringToByte(raw))
  }
  b64URLDecodeString(encoded) {
    return this.byteToUTF8String(this.b64URLDecode(encoded))
  }
}

module.exports = Platform
