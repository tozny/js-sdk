/**
 * Computation data for Tozny's Secure Compute.
 *
 *  @property {object} computation Wraps data for a Secure Compute computation.
 */
class Computation {
    constructor(computations) {
      this.computations = computations
    }

    static decode(json){
        if("computations" in json)
            return new Computation(json.computations)
        // If json is an empty object, create a new Computation object with an empty array
        return new Computation([])
    }
}

  module.exports = Computation
