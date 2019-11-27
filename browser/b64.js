/**
 * Adapted from base64-js with URL encoding added.
 *
 * @see https://github.com/beatgammit/base64-js
 */

const lookup =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const urlLookup =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const revLookup = []
const urlRevLookup = []

for (var i = 0, len = lookup.length; i < len; ++i) {
  revLookup[lookup.charCodeAt(i)] = i
  urlRevLookup[urlLookup.charCodeAt(i)] = i
}

function getLens(b64) {
  let validLen = b64.indexOf('=')
  if (validLen === -1) {
    validLen = b64.length
  }

  var placeHoldersLen = b64.length - validLen
  return [validLen, placeHoldersLen]
}

function toByteArray(b64, type) {
  const charSet = type === 'url' ? urlRevLookup : revLookup
  var tmp
  var lens = getLens(b64)
  var validLen = lens[0]
  var placeHoldersLen = lens[1]

  var arr = new Uint8Array(
    ((validLen + placeHoldersLen) * 3) / 4 - placeHoldersLen
  )

  var curByte = 0

  // if there are placeholders, only get up to the last complete 4 chars
  var len = placeHoldersLen > 0 ? validLen - 4 : validLen

  var i
  for (i = 0; i < len; i += 4) {
    tmp =
      (charSet[b64.charCodeAt(i)] << 18) |
      (charSet[b64.charCodeAt(i + 1)] << 12) |
      (charSet[b64.charCodeAt(i + 2)] << 6) |
      charSet[b64.charCodeAt(i + 3)]
    arr[curByte++] = (tmp >> 16) & 0xff
    arr[curByte++] = (tmp >> 8) & 0xff
    arr[curByte++] = tmp & 0xff
  }

  if (placeHoldersLen === 2) {
    tmp =
      (charSet[b64.charCodeAt(i)] << 2) | (charSet[b64.charCodeAt(i + 1)] >> 4)
    arr[curByte++] = tmp & 0xff
  }

  if (placeHoldersLen === 1) {
    tmp =
      (charSet[b64.charCodeAt(i)] << 10) |
      (charSet[b64.charCodeAt(i + 1)] << 4) |
      (charSet[b64.charCodeAt(i + 2)] >> 2)
    arr[curByte++] = (tmp >> 8) & 0xff
    arr[curByte++] = tmp & 0xff
  }

  return arr
}

function tripletToBase64(num, charSet) {
  return (
    charSet[(num >> 18) & 0x3f] +
    charSet[(num >> 12) & 0x3f] +
    charSet[(num >> 6) & 0x3f] +
    charSet[num & 0x3f]
  )
}

function encodeChunk(uint8, start, end, charSet) {
  let tmp
  let output = []
  for (var i = start; i < end; i += 3) {
    tmp =
      ((uint8[i] << 16) & 0xff0000) +
      ((uint8[i + 1] << 8) & 0xff00) +
      (uint8[i + 2] & 0xff)
    output.push(tripletToBase64(tmp, charSet))
  }
  return output.join('')
}

function fromByteArray(uint8, type, pad = true) {
  const charSet = type === 'url' ? urlLookup : lookup
  const len = uint8.length
  const extraBytes = len % 3 // if we have 1 byte left, pad 2 bytes
  const maxChunkLength = 16383 // must be multiple of 3
  let tmp
  let parts = []

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(
      encodeChunk(
        uint8,
        i,
        i + maxChunkLength > len2 ? len2 : i + maxChunkLength,
        charSet
      )
    )
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  if (extraBytes === 1) {
    tmp = uint8[len - 1]
    parts.push(charSet[tmp >> 2] + charSet[(tmp << 4) & 0x3f])
    if (pad) {
      parts.push('==')
    }
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + uint8[len - 1]
    parts.push(
      charSet[tmp >> 10] +
        charSet[(tmp >> 4) & 0x3f] +
        charSet[(tmp << 2) & 0x3f]
    )
    if (pad) {
      parts.push('=')
    }
  }

  return parts.join('')
}

module.exports = {
  toByteArray,
  fromByteArray,
}
