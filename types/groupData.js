const Signable = require('./signable')

class GroupData extends Signable {
  constructor(data) {
    super()

    for (let key in data) {
      // eslint-disable-next-line no-prototype-builtins
      if (data.hasOwnProperty(key)) {
        this[key] = data[key]
      }
    }
  }
}

module.exports = GroupData
