const Platform = require('../lib/crypto/platform')
const b64 = require('./b64')

class BrowserPlatform extends Platform {
  b64encode(raw) {
    return b64.fromByteArray(raw)
  }

  b64decode(encoded) {
    return b64.toByteArray(encoded)
  }

  b64URLDecode(encoded) {
    return b64.toByteArray(encoded, 'url')
  }

  b64URLEncode(raw) {
    return b64.fromByteArray(raw, 'url', false)
  }

  byteToUTF8String(byteArray) {
    let out = ''
    let i = 0
    const length = byteArray.length

    while (i < length) {
      let byte = byteArray[i++]
      let byte2
      let byte3
      switch (byte >> 4) {
        case 0:
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
        case 6:
        case 7:
          // 0xxxxxxx
          out += String.fromCharCode(byte)
          break
        case 12:
        case 13:
          // 110x xxxx   10xx xxxx
          byte2 = byteArray[i++]
          out += String.fromCharCode(((byte & 0x1f) << 6) | (byte2 & 0x3f))
          break
        case 14:
          // 1110 xxxx  10xx xxxx  10xx xxxx
          byte2 = byteArray[i++]
          byte3 = byteArray[i++]
          out += String.fromCharCode(
            ((byte & 0x0f) << 12) |
              ((byte2 & 0x3f) << 6) |
              ((byte3 & 0x3f) << 0)
          )
          break
      }
    }
    return out
  }

  UTF8StringToByte(str) {
    const byteArray = []
    for (var i = 0; i < str.length; i++) {
      let charCode = str.charCodeAt(i)
      if (charCode < 0x80) byteArray.push(charCode)
      else if (charCode < 0x800) {
        byteArray.push(0xc0 | (charCode >> 6), 0x80 | (charCode & 0x3f))
      } else if (charCode < 0xd800 || charCode >= 0xe000) {
        byteArray.push(
          0xe0 | (charCode >> 12),
          0x80 | ((charCode >> 6) & 0x3f),
          0x80 | (charCode & 0x3f)
        )
      }
      // surrogate pair
      else {
        i++
        // UTF-16 encodes 0x10000-0x10FFFF by
        // subtracting 0x10000 and splitting the
        // 20 bits of 0x0-0xFFFFF into two halves
        charCode =
          0x10000 + (((charCode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff))
        byteArray.push(
          0xf0 | (charCode >> 18),
          0x80 | ((charCode >> 12) & 0x3f),
          0x80 | ((charCode >> 6) & 0x3f),
          0x80 | (charCode & 0x3f)
        )
      }
    }
    return new Uint8Array(byteArray)
  }
}

module.exports = BrowserPlatform
