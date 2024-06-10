/**
 * The result from running an identity list operation.
 */
class ListIdentitiesResult {
	constructor(client, realmName, usernames, emails, clientIds, max, next, searchParam = '') {
		this.client = client
		this.realmName = realmName
		this.usernames = usernames
		this.emails = emails
		this.clientIds = clientIds
		this.searchParam = searchParam
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

		let response;

		if (this.searchParam !== '') {
			response = await this.client._searchIdentites(
				this.realmName,
				this.searchParam,
				this.max,
				this.nextToken
			)
		} else {
			response = await this.client._listIdentities(
				this.realmName,
				this.usernames,
				this.emails,
				this.clientIds,
				this.max,
				this.nextToken
			)
		}
		
		// If we've reached the last page, keep track and exit
		if (response.next === -1) {
			this.done = true
		}
		this.nextToken = response.next

		return response.identities
	}
}

module.exports = ListIdentitiesResult
