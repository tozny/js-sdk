const FileOperationsBase = require('../lib/storage/fileOperations')

/**
 * Handle browser specific file operations
 *
 * *Uploads*
 * In this version, browsers take a Blob object as the source of a file. This can
 * be an in-memory blob, but is just as likely a File object from an input
 * element. The blob is read in slices, encrypted, and collected in memory before
 * conversion into a new Blob, which is uploaded using the fetch API.
 *
 * *Download*
 * In this version, browsers use fetch to download the file, returning the
 * ReadableStream body. This stream is decrypted and the decrypted bytes are
 * sent into a new ReadableStream which emits the unencrypted bytes. Only when
 * the return is converted to an object, string, or other type are the bytes
 * completely held in memory, the rest is processed via the Web Streams API.
 */
class FileOperations extends FileOperationsBase {
  validateHandle(handle) {
    if (!(handle instanceof Blob)) {
      throw new Error('File handles must be an instance of Blob in browsers.')
    }
  }

  decryptDestination() {
    return new DecryptedStream()
  }

  encryptDestination() {
    return new BlobTempFile()
  }

  sourceReader(handle, blockSize) {
    return new BlobReader(handle, blockSize)
  }

  async download(url) {
    const response = await fetch(url)
    if (!response.ok) {
      const err = new Error(
        `Unable to download file: ${(await response).statusText}`
      )
      err.statusCode = response.status
      throw err
    }
    return response.body.getReader()
  }

  async upload(url, body, checksum, size) {
    const req = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-MD5': checksum,
        'Content-Length': size,
      },
      body,
    })
    if (!req.ok) {
      const err = new Error(`Unable to upload file: ${req.statusText}`)
      err.statusCode = req.status
      throw err
    }
  }
}

/**
 * Reads Blob objects in chunks based on blockSize
 */
class BlobReader {
  constructor(blob, blockSize) {
    this._blob = blob
    this._blockSize = blockSize
    this._index = 0
    this._remainingBytes = blob.size
    this._chain = Promise.resolve()
  }

  read() {
    // Doing this organized in a chain of promises ensures that each chunk is
    // processed and returned sequentially -- byte order is maintained.
    this._chain = this._chain.then(() => {
      return new Promise((res, rej) => {
        const chunkSize = Math.min(this._blockSize, this._remainingBytes)
        const slice = this._blob.slice(this._index, this._index + chunkSize)
        const reader = new FileReader()
        reader.onload = () => {
          this._index += chunkSize
          this._remainingBytes -= chunkSize
          const chunk = {
            value: new Uint8Array(reader.result),
            done: chunkSize !== this._blockSize || this._remainingBytes < 1,
          }
          res(chunk)
        }
        reader.onerror = rej
        reader.readAsArrayBuffer(slice)
      })
    })
    return this._chain
  }
}

/**
 * Collects bytes into a blob file, usable in browser upload bodies.
 *
 * To prevent extra bytes being necessary, we collect all of the byte arrays
 * in the `blocks` array and pass that to the Blob constructor all at once.
 */
class BlobTempFile {
  constructor() {
    this.blocks = []
  }
  write(bytes) {
    this.blocks.push(bytes)
  }
  getUploadable() {
    return new Blob(this.blocks, { type: 'application/octet-stream' })
  }
  remove() {
    this.blocks = []
  }
}

/**
 * Converts decrypted bytes into a standardized ReadableStream.
 *
 * ReadableStream is the item returned as the response body from Fetch, so in
 * general any browser supporting fetch also supports ReadableStream.
 */
class DecryptedStream {
  constructor() {
    this.stream = new ReadableStream({
      start: controller => {
        this.controller = controller
      },
    })
  }

  write(chunk) {
    this.controller.enqueue(chunk)
  }

  close() {
    this.controller.close()
  }

  getReader() {
    return this.stream
  }
}

module.exports = FileOperations
