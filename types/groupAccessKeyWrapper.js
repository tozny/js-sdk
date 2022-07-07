/**
 * Wraps group access key information into a single object
 *
 * @property {string} membership_key
 * @property {string} public_key
 * @property {string} access_key_id
 * @property {string} group_public_key
 *
 */
 class GroupAccessKeyWrapper {
    constructor(accessKeyWrapper) {
        this.membership_key = accessKeyWrapper.membership_key
        this.public_key = accessKeyWrapper.public_key
        this.access_key_id = accessKeyWrapper.access_key_id
        this.group_public_key = accessKeyWrapper.group_public_key
    }
  }

  module.exports = GroupAccessKeyWrapper
