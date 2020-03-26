const FileOperationsBase = require('../lib/storage/fileOperations')
const stream = require('stream')
const path = require('path')
const fs = require('fs')
const http = require('http')
const https = require('https')
const { tmpdir } = require('os')
const uuidv4 = require('uuid/v4')

class FileOperations extends FileOperationsBase {
  validateHandle(handle) {
    if (!(handle instanceof stream.Readable)) {
      throw new Error(
        'File handles must be an instance of stream.Readable in Node.'
      )
    }
  }

  decryptDestination() {
    const reader = new stream.PassThrough()
    return {
      write: chunk => reader.write(chunk),
      close: () => reader.end(),
      getReader: () => reader,
    }
  }

  encryptDestination() {
    const filePath = path.join(tmpdir(), uuidv4())
    const writeStream = fs.createWriteStream(filePath)
    return {
      write: chunk => writeStream.write(chunk),
      remove: () =>
        fs.unlink(filePath, err => {
          if (err) {
            console.error(err)
          }
        }),
      getUploadable: () => {
        writeStream.end()
        return fs.createReadStream(filePath)
      },
    }
  }

  readStream(handle, blockSize) {
    let doneFired = false
    const readUntilData = async () => {
      let chunk
      while (!doneFired) {
        chunk = handle.read(blockSize)
        if (chunk !== null) {
          return chunk
        }
        // no chunk available, wait for 1 milliseconds and try again
        // this basically kicks us to the next tick, but process.nextTick is
        // not letting this because of the await.
        await new Promise(r => setTimeout(r, 1))
      }
      return null
    }
    let buffer = readUntilData()
    const readable = {
      done: false,
      next: async () => {
        while (buffer) {
          const currentChunk = await buffer
          if (!currentChunk) {
            throw new Error('No bytes returned, but not done reading file.')
          }
          const nextChunk = await readUntilData()
          // If there is no next chunk (null), and done has been fired
          // this is the last chunk. Mark this queue as done.
          readable.done = doneFired && !nextChunk
          // Get the current buffer and send
          buffer = nextChunk
          return currentChunk
        }
      },
    }
    handle.on('end', () => {
      doneFired = true
    })
    return readable
  }

  async download(url) {
    const requestLib = url.startsWith('https') ? https : http
    return new Promise((res, rej) => {
      requestLib
        .get(url, response => {
          // handle http errors
          if (response.statusCode < 200 || response.statusCode > 299) {
            rej(new Error(`Upload failed : ${response.statusCode}`))
            return
          }
          res(new StreamReadable(response))
        })
        .on('error', rej)
        .on('abort', () => rej(new Error('Download aborted.')))
    })
  }

  async upload(url, body, checksum, size) {
    const requestLib = url.startsWith('https') ? https : http
    const options = {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-MD5': checksum,
        'Content-Length': size,
        Expect: '100-continue',
      },
    }
    return new Promise((res, rej) => {
      const request = requestLib.request(url, options, response => {
        // handle http errors
        if (response.statusCode < 200 || response.statusCode > 299) {
          rej(new Error(`Upload failed : ${response.statusCode}`))
          return
        }
        res()
        response.on('data', console.log)
      })
      request.on('error', rej)
      request.on('abort', () => rej(new Error('Upload aborted.')))
      request.on('continue', () => body.pipe(request))
    })
  }
}

class StreamReadable {
  constructor(readableStream, blockSize) {
    this._blockSize = blockSize
    this._stream = readableStream
    this._buffer = this._readUntilData()
    this._doneFired = false
    this._stream.on('end', () => {
      this._doneFired = true
    })
  }
  async _readUntilData(blockSize) {
    let chunk
    while (!this._doneFired) {
      chunk = this._stream.read(blockSize || this._blockSize)
      if (chunk !== null) {
        return chunk
      }
      // no chunk available, wait for 1 milliseconds and try again
      // this basically kicks us to the next tick, but process.nextTick is
      // not letting this because of the await.
      await new Promise(r => setTimeout(r, 1))
    }
    return null
  }
  async read(blockSize) {
    while (this._buffer) {
      // While this is normally a resolved value, the first time it isn't.
      // Dropping the await on it makes sure it works in both cases.
      const currentChunk = {
        value: await this._buffer,
      }
      if (!currentChunk.value) {
        throw new Error('No bytes returned, this stream is not done')
      }
      const nextChunk = await this._readUntilData(blockSize)
      // If there is no next chunk (null), and done has been fired
      // this is the last chunk. Indicate this in the return.
      currentChunk.done = this._doneFired && !nextChunk
      // Get the current buffer and send
      this._buffer = nextChunk
      return currentChunk
    }
    return { value: null, done: true }
  }
}

module.exports = FileOperations
