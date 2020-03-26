const FileOperationsBase = require('../lib/storage/fileOperations')

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

  readStream(handle, blockSize) {
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
