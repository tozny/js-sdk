const Signable = require('./signable')

class GroupData extends Signable {
  constructor(name, capabilities) {
    super()
    this.groupName = name
    if (capabilities !== undefined) {
      this.capabilities = []
    }
    capabilities.forEach((item, index) => {
      if (typeof item === 'string') {
        this.capabilities[index] = item
      }
    })
  }
}

module.exports = GroupData
