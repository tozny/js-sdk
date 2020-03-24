const FileOperationsBase = require('../lib/storage/fileOperations')
const uuidv4 = require('uuid/v4')

class FileOperations extends FileOperationsBase {
  validateHandle(handle) {
    if (!(handle instanceof Blob)) {
      throw new Error('File handles must be an instance of Blob in browsers.')
    }
  }

  decryptDestination() {
    return new DBTempFile()
  }

  encryptDestination() {
    return new BlobTempFile(uuidv4())
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

  async downloadFile(url) {
    const response = await fetch(url)
    if (!response.ok) {
      const err = new Error(
        `unable to download file: ${(await response).statusText}`
      )
      err.statusCode = response.status
      throw err
    }
    return response.body
  }

  async uploadFile(url, body, checksum, size) {
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

class DBTempFile {
  constructor(fileName) {
    this.fileName = fileName
    this.version = 1
    this._tableName = 'chunks'
    this._open = true
    this._pointer = false
    this._db = new Promise((resolve, reject) => {
      // Open the indexedDB.
      const r = indexedDB.open(this._storeName, this.version)
      r.onupgradeneeded = e => {
        const db = e.target.result
        db.createObjectStore(this._tableName, { autoIncrement: true })
      }
      r.onsuccess = e => {
        this._request = r
        resolve(e.target.result)
      }
      r.onerror = e => {
        reject(e)
      }
    })
  }

  write(chunk) {
    this._db
      .then(db => {
        db.transaction([this._tableName], 'readwrite')
          .objectStore(this._tableName)
          .add(chunk)
      })
      .then(trans => {
        return new Promise((resolve, reject) => {
          trans.onerror = reject
          trans.onsuccess = e => resolve(e.target.result)
        })
      })
  }

  read() {
    // So that read returns a new promise each time, store the pending promise
    // in the pointer.
    let nextValSet
    const nextValue = new Promise((resolve, reject) => {
      nextValSet = { resolve, reject }
    })
    if (!this._pointer) {
      this._db.then(db => {
        const store = db
          .transaction([this._tableName])
          .objectStore(this._tableName)
        const cursor = store.openCursor()
        this._traverse = {
          store,
          nextValue: nextValSet,
        }
        cursor.onsuccess = e => {
          const { result } = e.target
          const val =
            result && result.value instanceof Uint8Array
              ? result.value
              : new Uint8Array()
          if (!val.length) {
            this._traverse.nextValue.resolve(val)
            delete this._traverse
          } else {
            this._traverse.cursor = result
            this._traverse.nextValue.resolve(val)
          }
        }
        cursor.onerror = e => this._traverse.nextValue.reject(e)
      })
    } else {
      this._traverse.nextValue = nextValSet
      this._traverse.cursor.continue()
    }
    return nextValue
  }

  expire() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.deleteDatabase(this._storeName)
      r.onsuccess = () => resolve(true)
      r.onerror = () => reject(false)
    })
  }
}

module.exports = FileOperations
