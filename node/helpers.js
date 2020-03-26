const fs = require('fs')

module.exports = {
  async saveFile(file, filePath, options) {
    const destination = fs.createWriteStream(filePath, options)
    const stream = await file.read()
    stream.pipe(destination)
    return new Promise((res, rej) => {
      stream.on('error', rej)
      stream.on('finish', () => res(filePath))
    })
  },
}
