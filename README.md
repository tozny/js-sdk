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
<script type="text/javascript"  src="https://unpkg.com/@toznysecure/sdk@<version>/dist/tozny-sodium.min.js"></script>
<script type="text/javascript">
  // Tozny global is no available
  console.log(Tozny)
</script>
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
    const written = await client.writeRecord(
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
    const read = await client.readRecord(written.meta.recordId)
    console.log(`Full Name: ${read.data.first_name} ${read.data.last_name}`)

    // Updated the data to change the phone number
    // This replaces the stored document with the updated one
    read.data.phone = '555-555-1234'
    const updated = await client.updateRecord(read)
    console.log(`Record ${updated.meta.recordId} was updated`)

    // Delete the record from the database
    // Sending the version ensures no updates have taken place before removal.
    await client.deleteRecord(updated.meta.recordId, updated.meta.version)
    console.log('The record was deleted')
  } catch(e) {
    console.error(e)
  }
}

main()
```

**Basic Search records**

_Note that the search API is not immediately consistent. It can take a small amount of time to index a newly written record._

```js
const client = new Tozny.storage.Client(/* config */)

async function main() {
  try {
    // Write several musicians records with consistent data keys
    const request = new Tozny.types.Search(true) // includeDate = true
    request.match({ type: 'musicians' })
    const resultQuery = await writer.search(request)
    const found = await resultQuery.next()
    for (let record of found) {
      console.log(`Found record ${record.meta.recordId}: ${record.data.first_name} plays ${record.meta.plain.instrument}`)
    }
  } catch(e) {
    console.error(e)
  }
}

main()
```

**Advanced Search records**

_Complex search queries can be constructed with various matching, exclude, and range sets._

```js
const client = new Tozny.storage.Client(/* config */)

async function main() {
  try {
    // Write several records

    // include data, include all writers, return 10 items per page
    const request = new Tozny.types.Search(true, true, 10)
    const oneWeekAgo = new Date()
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
    // Multiple matches and excludes stack with OR, date ranges can be set with 'range'
    // This request matches all records modified within 7 days of exactly type
    // 'musicians' and a meta key present called 'instrument', or any records
    // fuzzy matching a type of 'music', excluding any record matching the array
    // of record IDs or written the requesting client.
    request
      .match({ type: 'musicians', key: 'instrument',  }, 'AND', 'EXACT')
      .match({ type: 'music' }, 'OR', 'FUZZY')
      .exclude({ records: ['...', '...'], writers: client.config.clientId})
      .range(oneWeekAgo, Date.now(), 'MODIFIED')
    const resultQuery = await writer.search(request)
    const found = await resultQuery.next()
    for (let record of found) {
      console.log(`Found record ${record.meta.recordId}: ${record.data.first_name} plays ${record.meta.plain.instrument}`)
    }
  } catch(e) {
    console.error(e)
  }
}

main()
```

**Share or revoke access to a record type with another client**

```js
const client = new Tozny.storage.Client(/* config */)
const shareToId = '000000000000-0000-0000-0000-000000000'
const typeToShare = 'shared-type'

async function main() {
  try {
    // type, clientId
    await client.share(typeToShare, shareToId)
    console.log(`${typeToShare} shared with ${shareToId}`)
    await client.revoke(typeToShare, shareToId)
    console.log(`${sharedType} no longer shared with ${sharedToId}`)
  } catch(e) {
    console.error(e)
  }
}

main()
```

**authorize or deauthorized another client to share on your behalf**

```js
const client = new Tozny.storage.Client(/* config */)
const authorizerClient = new Tozny.storage.Client(/* config */)
const shareToId = '000000000000-0000-0000-0000-000000000'
const typeToShare = 'shared-type'

async function main() {
  try {
    await addAuthorizer(typeToShare, authorizerClient.config.clientId)
    console.log(`${authorizerClient.config.clientId} authorized to share ${typeToShare} on behalf of ${client.config.clientId}`)
    await shareOnBehalfOf(client.config.clientId, typeToShare, shareToId)
    console.log(`${typeToShare} shared with ${shareToId}`)
    await revokeOnBehalfOf(client.config.clientId, typeToShare, shareToId)
    console.log(`${typeToShare} no longer shared with ${shareToId}`)
    await removeAuthorizer(typeToShare, authorizerClient.config.clientId)
    console.log(`${authorizerClient.config.clientId} no longer authorized to share ${typeToShare} on behalf of ${client.config.clientId}`)
  } catch(e) {
    console.error(e)
  }
}

main()
```

### Notes

Notes provide a mechanism transfer or save data encrypted for a single specified set of cryptographic keys. These keys may or may not belong to another client in the TozStore system. This is a one way transfer. The writer of a note can update or delete the note contents, but they can not read it. The reader of the note can read it, but can not update or delete it. The writer and reader keys on a note can be the same.

**Write, read, and delete**

```js
const client = new Tozny.storage.Client(/* config */)

async function main() {
  try {
    // data to encrypt, public encryption key, public signing key, storage and metadata options
    const written = await client.writeNote(
      {
        lyric1: 'What a wonderful world',
        lyric2: 'Oh, the shark, babe, has such teeth, dear'
      },
      client.config.publicKey,
      client.config.publicSigningKey,
      {
        id_string: 'louis-song-ideas', // user defined global name
        max_views: -1, // save for indefinite number of reads
        expires: false, // do not expire this record based on time
      }
    )
    console.log(`Wrote note ${written.noteId}`)

    // Read the note by ID
    const readById = await client.readNote(written.noteId)
    console.log(`Lyric 1: ${readById.data.lyric1}`)

    // Read the note by name
    const readByName = await client.readNoteByName('louis-song-ideas')
    console.log(`Lyric 2: ${readByName.data.lyric2}`)

    // Delete the note from the database
    await client.deleteNote(written.noteId)
    console.log('The note was deleted')
  } catch(e) {
    console.error(e)
  }
}

main()
```

**Replace a named note**

Notes are generally speaking immutable. However, note names are global. If a name is relied on. While a normally a new note could be written and then the old note deleted to ensure data integrity, with a note name, this is not possible. For this reason the API provides a single operation endpoint to replace a named note with a new one. If writing the new note throws any kind of error, the operation is rolled back to prevent data loss. The operation amounts to a guaranteed delete-then-write of the named note.

```js
const client = new Tozny.storage.Client(/* config */)

async function main() {
  try {
    // data to encrypt, public encryption key, public signing key, storage and metadata options
    const replaced = await client.writeNote(
      {
        lyric1: 'What a wonderful world',
        lyric2: 'Oh, the shark, babe, has such teeth, dear',
        lyric3: 'I done forgot the words'
      },
      client.config.publicKey,
      client.config.publicSigningKey,
      {
        id_string: 'louis-song-ideas', // user defined global name
        max_views: -1, // save for indefinite number of reads
        expires: false, // do not expire this record based on time
      }
    )
    console.log(`Replace note with note ${written.noteId}`)
    console.log(`The note name is ${written.options.idString}`)

  } catch(e) {
    console.error(e)
  }
}

main()
```

## Terms of Service

Your use of E3DB must abide by our [Terms of Service](https://github.com/tozny/e3db-java/blob/master/terms.pdf), as detailed in the linked document.
