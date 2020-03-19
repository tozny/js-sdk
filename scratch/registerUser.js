// const uuidv4 = require('uuid/v4')
const Tozny = require('../node')

const config = {
  realm: 'TheShire',
  apiUrl: 'http://platform.local.tozny.com:8000',
  username: `luke+2@tozny.com`,
  password: 'password',
  token: '5f427a848245d7856e024241f22a1a76b885f14d0296948976b97c686f05e8e8',
}

config.recoveryUrl = `http://localhost:8080/${config.realm}/recover`

async function register() {
  try {
    const realm = new Tozny.identity.Realm(
      config.realm,
      'account',
      config.recoveryUrl,
      config.apiUrl
    )
    const registration = await realm.register(
      config.username,
      config.password,
      config.token,
      config.username
    )
    console.log(config.username)
    console.log(config.password)
    console.log(registration.stringify())
  } catch (e) {
    console.error(e)
  }
}

async function challenge() {
  try {
    const realm = new Tozny.identity.Realm(
      config.realm,
      'account',
      config.recoveryUrl,
      config.apiUrl
    )
    const requested = await realm.initiateRecovery(config.username)
    console.log(requested)
  } catch (e) {
    console.error(e)
  }
}

register()
// challenge()

/*
luke+0424a35f-0b16-4f00-a73c-8836711b8e31@tozny.com
scratch.js:27
03dbf61f-6523-464d-b5f4-a9c43e7ecd69
scratch.js:28
{"config":{"realmName":"luketest20200103","appName":"account","username":"luke+0424a35f-0b16-4f00-a73c-8836711b8e31@tozny.com","userId":125,"apiUrl":"https://staging.e3db.com","brokerTargetUrl":"https:/staging.id.tozny.com/luketest20200103/recover"},"storage":{"version":2,"api_url":"https://staging.e3db.com","api_key_id":"5e66e22b04ef39d5dc0a35c7326739a5c18bdd3db998dc30d801fecc18685e8c","api_secret":"95ea53a48be849bdb41c52900022869b1fc6c51f344fe3d494e47ad72a73d5c1","client_id":"6a2dc0a9-2f18-4bb9-9cb5-dbb5cbf1c34b","public_key":"Kktq8RiaxoIHvmq8lEni8haeHXP7E-XSK8elg851ezk","private_key":"2oF_wA_fLjh-N_vDdluhPyokcmlra2QKj47igHqAimQ","public_signing_key":"WxwDJrHtsX6BTTmj13KWjBifyhb8PpIebdh5FzZaif8","private_signing_key":"GBSYp3vhq_Nj0H84AS_ltz7vTsOOaOQKVjdrkbMqUqlbHAMmse2xfoFNOaPXcpaMGJ_KFvw-kh5t2HkXNlqJ_w"}}
*/

/*
luke+1@tozny.com
scratch.js:27
af4f7acd-46bc-4cfd-bbc9-de25b30babce
scratch.js:28
{"config":{"realmName":"luke20200211","appName":"account","username":"luke+1@tozny.com","userId":452,"apiUrl":"https://dev.e3db.com","brokerTargetUrl":"https://dev.id.tozny.com/luke20200211/recover"},"storage":{"version":2,"api_url":"https://dev.e3db.com","api_key_id":"bab1f87dfd23482818dc54a682751df9a604162ff7bb72eb52a45d93bb9a27f1","api_secret":"bea8e113bed830abf5006df9b9f035282d0a695a28418e22850d4cb3793a62f7","client_id":"5933914a-2ec3-4592-8220-201abb2059df","public_key":"-O5FPuljwEK94iBpIUNR8rDjSjrqmYYg_qwV5QlSASA","private_key":"Rq0G8zbw8llj8CcRfhu-GWMjDqM9PYe6MmGMsOSJQ7U","public_signing_key":"nxKWkKlx4yo00AUd0COBQkhw99f4S5Owu1ph8uD5k0Q","private_signing_key":"XP9qhA6AvqH5tgA7DU4E4mGaJMqXtiZPKaLE0uQJWbSfEpaQqXHjKjTQBR3QI4FCSHD31_hLk7C7WmHy4PmTRA"}}
*/
