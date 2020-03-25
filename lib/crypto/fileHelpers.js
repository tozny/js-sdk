/**
 * Finds the third period character in a Uint8Array to locate the Tozny header.
 *
 * @param {Uint8Array} byteArr The array to search for the Tozny header index
 */
function toznyHeaderIndex(byteArr) {
  const period = '.'.charCodeAt(0)
  let index = -1
  for (let i = 0; i < 3; i++) {
    index = Array.prototype.indexOf.apply(byteArr, [period, index + 1])
    if (index === -1) {
      break
    }
  }
  return index
}

/**
 * Gets the Tozny header from a stream, checks the version, and send the data key.
 *
 * @param {Uint8Array} chunk The next chunk coming from the streaming source
 * @param {*} context The context for the transformation operation
 * @param {object} control The control objects to allow the transformer to modify
 *                         the overall data flow of the transformation process.
 */
async function versionAndKeys(chunk, context, control) {
  // Insanity check -- if we get too far into a file, we wont likely find the header
  // Only do this on the second go around just in case the source chunks are > 1KB
  if (chunk.length > 1024 && context.pastFirst) {
    throw new Error('Tozny header not found in the first KB of the file')
  }
  context.pastFirst = true
  // Locate the end of header index
  const index = toznyHeaderIndex(chunk)
  // If no header was found expand the chunk
  if (index === -1) {
    control.continue(chunk, true)
    return
  }
  // Once found split the chunk into sub arrays, the header and any extra
  const header = chunk.subarray(0, index)
  const extra = chunk.subarray(index + 1)
  // Parse the header
  const [version, edk, edkN] = context.crypto.platform
    .byteToUTF8String(header)
    .split('.')
  // Verify version is supported
  if (parseInt(version, 10) !== context.supportedVersion) {
    throw new Error(
      `Unsupported file version: ${version}. This SDK supports version ${context.supportedVersion}.`
    )
  }
  // Decrypt the data key
  context.dk = await context.crypto.provider.decryptSymmetric(
    context.crypto.platform.b64URLDecode(edk),
    context.crypto.platform.b64URLDecode(edkN),
    context.accessKey
  )
  // Clean up the context
  delete context.headerBytes
  delete context.pastFirst
  delete context.accessKey
  delete context.supportedVersion
  // Mark this as done, and send back the extra bytes
  control.done(extra)
}

/**
 * Gets any extra bytes required from the stream and creates the streaming cipher.
 *
 * @param {Uint8Array} chunk The next chunk coming from the streaming source
 * @param {*} context The context for the transformation operation
 * @param {object} control The control objects to allow the transformer to modify
 *                         the overall data flow of the transformation process.
 */
async function streamCipher(chunk, context, control) {
  // If not enough bytes are available, expand the chunk
  if (chunk.length < context.extraHeaderSize) {
    control.continue(chunk, true)
  }
  // Split the chunk into the header and extra bytes
  const extraHeader = chunk.subarray(0, context.extraHeaderSize)
  const extra = chunk.subarray(context.extraHeaderSize)
  // Create the stream and store it in context
  context.stream = await context.crypto.provider.decryptStream(
    context.dk,
    extraHeader
  )
  // Clean up the context
  delete context.dk
  delete context.extraHeaderSize
  // Mark this as done, and send back the extra bytes
  control.done(extra)
}

/**
 * Accumulates chunks into blocks, decrypts them, and sends them to the destination.
 *
 * @param {Uint8Array} chunk The next chunk coming from the streaming source
 * @param {*} context The context for the transformation operation
 * @param {object} control The control objects to allow the transformer to modify
 *                         the overall data flow of the transformation process.
 */
async function decryptBlocks(chunk, context, control) {
  // Determine the needed remaining bytes
  const needed = context.blockSize - context.pointer
  // If the offset is zero or positive, we have enough bytes to finish the current block
  if (needed <= chunk.length) {
    // Split the block into the remaining current block bytes and any extra bytes
    const remaining = chunk.subarray(0, needed)
    const extra = chunk.subarray(needed)
    // Copy the remaining bytes to finish the block, decrypt, and write to the destination
    context.block.set(remaining, context.pointer)
    const decrypted = await context.stream.decrypt(context.block)
    context.destination.write(decrypted)
    // Reset the block and pointer to zero
    context.block = new Uint8Array(context.blockSize)
    context.pointer = 0
    // Use continue to process the extra bytes (this ensures if the block size)
    // from the source is bigger than our decryption block size, they are split
    // up and processed as necessary.
    control.continue(extra)
    return
  }
  // Block is not done yet, copy chunk bytes to the current block
  context.block.set(chunk, context.pointer)
  context.pointer = context.pointer + chunk.length
}

/**
 * When the source is empty, decrypts the last block and closes the destination.
 *
 * @param {*} context The context for the transformation operation
 */
function decryptLastBlock(context) {
  // If any remaining bytes are in the current block, decrypt them and
  // send them to the destination
  if (context.pointer > 0) {
    const lastBlock = context.block.subarray(0, context.pointer)
    context.destination.write(context.stream.decrypt(lastBlock))
  }
  // Tell the destination the file is complete
  context.destination.close()
}

/**
 * Creates an end of file function that errors if the process didn't complete
 *
 * @param {string} message The message to send on error
 */
function errorEOF(message) {
  return (_, eof) => {
    if (eof) {
      throw new Error(message)
    }
  }
}

module.exports = {
  versionAndKeys,
  streamCipher,
  decryptBlocks,
  decryptLastBlock,
  errorEOF,
}
