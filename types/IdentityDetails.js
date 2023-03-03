/**
 * Detailed information about a registered Identity for a Tozny realm.
 */
class IdentityDetails {
	constructor(
	  user_id,
    username,
    email,
    firstName,
    lastName,
    tozny_id,
  ) {
    this.user_id = user_id
    this.toznyId = tozny_id
    this.username = username
    this.email = email
    this.firstName = firstName
    this.lastName = lastName
  }

  /**
   * Specify how an already unserialized JSON array should be marshaled into
   * an object representation.
   *
   * <code>
   * identity = IdentityDetails::decode({
   *   id: '00000000-0000-0000-0000-000000000000',
   *   tozny_id: '00000000-0000-0000-0000-000000000000',
   *   name: 'jsmith',
   *   email: 'jsmith@example.com'
   *   first_name: 'John',
   *   last_name: 'Smith', 
   * })
   * <code>
   *
   * @param {object} json
   *
   * @return {iIdentityDetails}
   */
  static decode(json) {
    return new IdentityDetails(
      json.user_id,
      json.username,
      json.email,
      json.first_name,
      json.last_name,
      json.tozny_id
    )
  }
}

module.exports = IdentityDetails
