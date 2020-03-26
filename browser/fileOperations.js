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
    let index = 0
    let bytesLeft = handle.size
    let chain = Promise.resolve()
    const stream = {
      done: false,
      next() {
        chain = chain.then(async () => {
          const chunkSize = Math.min(blockSize, bytesLeft)
          const slice = handle.slice(index, index + chunkSize)
          const reader = new FileReader()
          return new Promise((res, rej) => {
            reader.onload = () => {
              res(new Uint8Array(reader.result))
            }
            reader.onerror = rej
            reader.readAsArrayBuffer(slice)
            index += chunkSize
            bytesLeft -= chunkSize
            // Detect if this is the last chuck and set the hasMore property
            stream.done = chunkSize !== blockSize || bytesLeft < 1
          })
        })
        return chain
      },
    }
    return stream
  }

  async download(url) {
    const response = await fetch(url)
    if (!response.ok) {
      const err = new Error(
        `unable to download file: ${(await response).statusText}`
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
      const err = new Error(`Upload error: ${req.statusText}`)
      err.statusCode = req.status
      throw err
    }
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
