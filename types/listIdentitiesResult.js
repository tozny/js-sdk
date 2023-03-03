/**
 * The result from running an identity list operation.
 */
class ListIdentitiesResult {
  constructor(client, realmName, max, next) {
    this.client = client
    this.realmName = realmName
    this.max = max
    this.nextToken = next
    this.done = false
  }

  /**
   * Get the next page of results from the current query
   *
   * @returns {Promise<array>}
   */
  async next() {
    // Finished iteration, exit early
    if (this.done) {
      return []
    }

    let response = await this.client._listIdentities(
      this.realmName,
      this.max,
      this.nextToken
    )
    // If we've reached the last page, keep track and exit
    if (response.next === -1) {
      this.done = true
    }
    this.nextToken = response.next

    return response.identities
  }
}

module.exports = ListIdentitiesResult
