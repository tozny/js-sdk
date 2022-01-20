const FileOperationsBase = require('../lib/storage/fileOperations')
const stream = require('stream')
const path = require('path')
const fs = require('fs')
const http = require('http')
const https = require('https')
const { tmpdir } = require('os')
const { v4: uuidv4 } = require('uuid')

/**
 * Handle Node specific file operations
 *
 * Node works with files in a completely streaming manner. At no point is the
 * entire set of bytes from a file held in memory. The file system is used for
 * temporary storage of encrypted bytes due to the need to fully calculate the
 * checksum before streaming the file to the upload URL.
 *
 * *Uploads*
 * In this version, Node takes a stream.Readable object as the source of a file.
 * Any stream.Readable is valid. The stream is encrypted and collected into a
 * temporary file on the OS. When complete, a stream.Readable to that file is
 * opened and streamed to the upload URL using built in node HTTP module.
 *
 * *Download*
 * In this version, Node uses the core HTTP library to download the file,
 * returning the stream.Readable body. This stream is decrypted and the
 * decrypted bytes are sent into a new stream.Readable which emits the
 * unencrypted bytes. This can be piped or used as any stream.Readable, such as
 * saved to a file, sent to stdOut, etc.
 */
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
      write: (chunk) => reader.write(chunk),
      close: () => reader.end(),
      getReader: () => reader,
    }
  }

  encryptDestination() {
    const filePath = path.join(tmpdir(), uuidv4())
    const writeStream = fs.createWriteStream(filePath)
    return {
      write: (chunk) => writeStream.write(chunk),
      remove: () =>
        fs.unlink(filePath, (err) => {
          if (err) {
            // eslint-disable-next-line no-console
            console.error(err)
          }
        }),
      getUploadable: () => {
        writeStream.end()
        return fs.createReadStream(filePath)
      },
    }
  }

  sourceReader(handle, blockSize) {
    return new StreamReader(handle, blockSize)
  }

  download(url) {
    const requestLib = url.startsWith('https') ? https : http
    return new Promise((res, rej) => {
      requestLib
        .get(url, (response) => {
          // handle http errors
          if (response.statusCode < 200 || response.statusCode > 299) {
            rej(new Error(`Unable to download file: ${response.statusText}`))
            return
          }
          res(new StreamReader(response))
        })
        .on('error', rej)
        .on('abort', () => rej(new Error('Download aborted.')))
    })
  }

  upload(url, body, checksum, size) {
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
      const request = requestLib.request(url, options, (response) => {
        // handle http errors
        if (response.statusCode < 200 || response.statusCode > 299) {
          rej(new Error(`Unable to upload file: ${response.statusCode}`))
          return
        }
        res()
      })
      request.on('error', rej)
      request.on('abort', () => rej(new Error('Upload aborted.')))
      request.on('continue', () => body.pipe(request))
    })
  }
}

/**
 * StreamReader wraps a stream.Readable for more consistent read operations.
 *
 * stream.Readable can return false from the read() operation when no bytes are
 * available. This wrapper ensures when read is called, bytes are always
 * returned unless the underlying stream is done and empty.
 *
 * This also allows specifying a block size at construction time, so that each
 * read operation returns a consistently sized block without sending that size
 * to each read operation. A size _can_ be sent with `.read(size)` to override
 * the block size.
 */
class StreamReader {
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
      // this basically kicks us to the next tick, but process.nextTick does
      // not work here because of the await.
      await new Promise((r) => setTimeout(r, 1))
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
      // Rotate the buffer and send back the current chunk
      this._buffer = nextChunk
      return currentChunk
    }
    return { value: null, done: true }
  }
}

module.exports = FileOperations
