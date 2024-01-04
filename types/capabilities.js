class Capabilities {
  constructor(capabilities) {
    this.manage = true
    this.share = capabilities['share']
    this.read = capabilities['read']
  }
  static toArray(capabilityBool) {
    let capabilities = []
    if (capabilityBool.share === true) {
      capabilities.push('SHARE_CONTENT')
    }
    if (capabilityBool.edit === true) {
      capabilities.push('EDIT_CONTENT')
    }
    if (capabilityBool.manage === true) {
      capabilities.push('MANAGE_MEMBERSHIP')
    }
    if (capabilityBool.read === true) {
      capabilities.push('READ_CONTENT')
    }
    return capabilities
  }

  static toObject(capabilityArray) {
    let capabilities = { manage: true }
    capabilityArray.forEach((capability) => {
      if (capability === 'SHARE_CONTENT') {
        capabilities['share'] = true
      }
      if (capability === 'EDIT_CONTENT') {
        capabilities['edit'] = true
      }
      if (capability === 'READ_CONTENT') {
        capabilities['read'] = true
      }
    })
    return capabilities
  }
}

module.exports = Capabilities
