const FileOperationsBase = require('../lib/storage/fileOperations')
// const uuidv4 = require('uuid/v4')

class FileOperations extends FileOperationsBase {
  validateHandle(handle) {
    if (!(handle instanceof Blob)) {
      throw new Error('File handles must be an instance of Blob in browsers.')
    }
  }

  decryptDestination() {
    return new DecryptedStream()
    // return new DBTempFile(uuidv4())
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
      // controller.close()
      // controller.enqueue(value)
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

// class DBTempFile {
//   constructor(fileName) {
//     this.fileName = fileName
//     this.version = 1
//     this._tableName = 'chunks'
//     this._open = true
//     this._pointer = {
//       index: 0,
//     }
//     this._db = new Promise((resolve, reject) => {
//       // Open the indexedDB.
//       const r = indexedDB.open(this.fileName, this.version)
//       r.onupgradeneeded = e => {
//         const db = e.target.result
//         db.createObjectStore(this._tableName, { autoIncrement: true })
//       }
//       r.onsuccess = e => resolve(e.target.result)
//       r.onerror = e => reject(e)
//     })
//   }

//   async write(chunk) {
//     const db = await this._db
//     // store the crypto key in the index DB
//     const trans = db
//       .transaction([this._tableName], 'readwrite')
//       .objectStore(this._tableName)
//       .add(chunk)
//     return new Promise((resolve, reject) => {
//       trans.onerror = reject
//       trans.onsuccess = e => resolve(e.target.result)
//     })
//   }

//   close() {
//     this._open = false
//   }

//   async read() {
//     // If this is done, just return the done flag
//     if (this._pointer.done) {
//       return Promise.resolve(this._pointer)
//     }
//     // Make sure we have a control promise for the next value available
//     const nextValue = new Promise((resolve, reject) => {
//       this._pointer.control = { resolve, reject }
//     })
//     // Make sure we have a cursor open to the database to fetch the value
//     if (!this._pointer.cursor) {
//       const db = await this._db
//       const trans = db.transaction([this._tableName])
//       // If the transaction is completed, which can happen when writes and
//       // reads are interspersed, remove the cursor reference.
//       trans.oncomplete = () => delete this._pointer.cursor
//       // Create the cursor advancing it to the current point index
//       // and setting up success/error handlers
//       const store = trans.objectStore(this._tableName)
//       const request = store.openCursor()
//       request.onsuccess = e => {
//         const { result } = e.target
//         if (result === null) {
//           // If the file is still open, wait for half a second and try again
//           if (this._open) {
//             setTimeout(() => {
//               const originalControl = this._pointer.control
//               this.read()
//                 .then(originalControl.resolve)
//                 .catch(originalControl.reject)
//             }, 500)
//             return
//           }
//           this._pointer.done = true
//         }
//         if (this._pointer.done === true) {
//           const { control } = this._pointer
//           this._pointer = { value: null, done: true }
//           control.resolve(this._pointer)
//           return
//         }
//         if (!this._pointer.cursor && this._pointer.index > 0) {
//           result.advance(this._pointer.index)
//           this._pointer.cursor = result
//           return
//         } else {
//           this._pointer.cursor = result
//         }
//         this._pointer.index++
//         this._pointer.control.resolve({ value: result.value, done: false })
//       }
//       request.onerror = e => this._pointer.control.reject(e)
//     } else {
//       this._pointer.cursor.continue()
//     }
//     return nextValue
//   }

//   async delete() {
//     // First close the DB connection and remove reference to it
//     const db = await this._db
//     await db.close()
//     delete this.db
//     // Now delete it
//     return new Promise((resolve, reject) => {
//       const r = indexedDB.deleteDatabase(this.fileName)
//       r.onsuccess = () => resolve(true)
//       r.onerror = e => reject(e)
//     })
//   }

//   getReader() {
//     const stream = new ReadableStream({
//       pull: async controller => {
//         while (this._open) {
//           await new Promise(r => setTimeout(r, 500))
//         }
//         const { value, done } = await this.read()
//         // If there is no more data, clean up
//         if (done) {
//           this.delete()
//           controller.close()
//           return
//         }
//         // Get the data and send it to the browser via the controller
//         controller.enqueue(value)
//       },
//     })

//     return new Response(stream)
//   }
// }

module.exports = FileOperations
