const fs = require('fs')

module.exports = {
  /**
   * Save the decrypted file to the file system as a new file.
   *
   * @param {File} file A File object ready for reading.
   * @param {string} filePath The path where the file should be saved on the OS.
   * @param {object} options The file options to pass to fs.createWriteStream.
   * @return {Promise<string>} A promise resolving when the save is complete with
   *                           the saved file path.
   */
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
