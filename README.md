# Tozny's Javascript Software Developers Kit

The Tozny Platform offers powerful tools for developers, enabling them to incorporate strong end-to-end encryption into their code bases. The Software Developer Kits provide the tools necessary for implementing the Tozny Platform without needing high cryptography expertise.

## Install and Set UP

```sh
npm install --save @toznysecure/sdk
```

**Node**

```js
const Tozny = require('@toznysecure/sdk/node')
```

**Browser: ES6**

```js
import Tozny from '@toznysecure/sdk/browser'
```

**Browser: Script Tag**

```html
<script src="https://unpkg.com/@toznysecure/sdk@1.0.0/dist/tozny-sodium.min.js"><script>
<!-- window.Tozny is now available -->
```

## Tozny Storage

**Register A Client**

Before you can register a storage client with Tozny platform you will need to [sign up for a Tozny Platform account](https://dashboard.tozny.com/register). Create a registration token and inject it into your code.

```js
const token = '...'

async function main(name) {
  try {

    const cryptoKeys  = await Tozny.storage.generateKeypair();
    const signingKeys = await Tozny.storage.generateSigningKeypair();
    const clientInfo  = await Tozny.storage.register(token, name, cryptoKeys, signingKeys)

    // Create a full client instance with the returned client details
    const config = new Tozny.storage.Config(
      clientInfo.clientId,
      clientInfo.apiKeyId,
      clientInfo.apiSecret,
      cryptoKeys.publicKey,
      cryptoKeys.privateKey,
      signingKeys.publicKey,
      signingKeys.privateKey
    )
    const client = new Tozny.storage.Client(config)

    // Perform additional storage actions with this client...
  } catch(e) {
    console.error(e)
  }
}
main('example-client')
```

You can optionally back up the client credentials with the account owner. When credentials are registered with an account backup, the clients configuration is encrypted and shared with the account. In the [Tozny Dashboard](https://dashboard.tozny.com/) the account owner will have access to the client credentials and record tools for this client.

```js
const clientInfo  = await Tozny.storage.register(token, name, cryptoKeys, signingKeys, true)
```

**Load Existing Client**

```js
/**
 * Assuming your credentials are stored as defined constants in the application environment
 */
const config = Tozny.storage.Config.fromObject({
  client_id: process.env.CLIENT_ID,
  api_key_id: process.env.API_KEY_ID,
  api_secret: process.env.API_SECRET,
  public_key: process.env.PUBLIC_KEY,
  private_key: process.env.PRIVATE_KEY,
  public_signing_key: process.env.PRIVATE_KEY,
  private_signing_key: process.env.PRIVATE_KEY,
})

const client = new Tozny.storage.Client(config)

// Perform additional storage actions with this client...
```

### Records

Records provide durable encryption protected documents to the Tozny Storage database. Once stored, a client can share records by type with any other client registered to the Tozny Platform.

**Write, Read, Update, Delete**

```js
const client = new Tozny.storage.Client(/* config */)

async function main() {
  try {
    // Write the data
    // record type, data to encrypt, plain text meta
    const written = await client.write(
      'musicians',
      {
        first_name: 'Louis',
        last_name: 'Armstrong',
        phone: '555-555-1212',
      },
      {
        instrument: 'Trumpet'
      }
    )
    console.log(`Wrote record ${written.meta.recordId}`)

    // Read the data directly by ID
    const read = await client.read(written.meta.recordId)
    console.log(`Full Name: ${read.data.first_name} ${read.data.last_name}`)

    // Updated the data to change the phone number
    // This replaces the stored document with the updated one
    read.data.phone = '555-555-1234'
    const updated = await client.update(read)
    console.log(`Record ${updated.meta.recordId} was updated`)

    // Delete the record from the database
    // Sending the version ensures no updates have taken place before removal.
    await client.delete(updated.meta.recordId, updated.meta.version
    console.log('The record was deleted')
  } catch(e) {
    console.error(e)
  }
}

main()
```

## Terms of Service

Your use of E3DB must abide by our [Terms of Service](https://github.com/tozny/e3db-java/blob/master/terms.pdf), as detailed in the linked document.
