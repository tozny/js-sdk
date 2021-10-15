const Serializable = require('./serializable')

class AccessRequestApprovalsRequest extends Serializable {
  constructor(realmName, approvals) {
    super()
    this.approvals = approvals
    this.realmName = realmName
  }

  serializable() {
    const approvals = this.approvals.map(
      (approval) => {
        return {
          access_request_id: approval.accessRequestId,
          comment: approval.comment
        }
      }
    )
    const toSerialize = {
      realm_name: this.realmName,
      approvals: approvals,
    }

    return toSerialize
  }
}

module.exports = AccessRequestApprovalsRequest
