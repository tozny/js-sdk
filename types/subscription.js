const Serializable = require("./serializable")

/**
 * @typedef Subscription
 * @type {object}
 * @property {string} computationID id of the computation
 * @property {String[]} recordTypesRequired the record types required to run computation
 */
class Subscription extends Serializable {
  /**
   * @param {string} toznyId The identity's Tozny storage client ID
   * @param {string[]} recordTypesRequired The identity's user ID
   */
  constructor(computationID, recordTypesRequired) {
    super()
    this.computationID = computationID
    this.recordTypesRequired = recordTypesRequired
  }

  serializable() {
    return {
      computation_id: this.computationID,
      recordTypesRequired: this.recordTypesRequired
    }
  }

  /** @returns {Subscription} */
  static decode(json) {
    const computationData = {
      computationID: json.computation_id,
      recordTypesRequired: json.record_types_required
    }

    return new Subscription(computationData.computationID, computationData.recordTypesRequired)
  }
}

module.exports = Subscription
