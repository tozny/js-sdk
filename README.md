[![Build Status](https://travis-ci.org/tozny/js-sdk.svg?branch=master)](https://travis-ci.org/tozny/js-sdk)

# Tozny's JavaScript Software Developers Kit

The Tozny Platform offers powerful tools for developers, enabling them to incorporate strong end-to-end encryption into their code bases. The Software Developer Kits provide the tools necessary for implementing the Tozny Platform without needing high cryptography expertise.

## Install and Set Up

```sh
npm install --save @toznysecure/sdk
```

### Node

```js
const Tozny = require('@toznysecure/sdk/node')
```

_Note: Requires Node 8.3+. Older versions may work depending on the features used._

### Browser

**ES6**:

```js
import Tozny from '@toznysecure/sdk/browser'
```

_Note: Due to security protocols, the full crypto capabilities of Tozny SDK are only available in secure environments (localhost or https)._

**Script Tag**:

```html
<script
  type="text/javascript"
  src="https://unpkg.com/@toznysecure/sdk@<version>/dist/tozny-sodium.min.js"
></script>
<script type="text/javascript">
  // Tozny global is now available
  console.log(Tozny)
</script>
```

## Tozny Storage

#### Register A Client

Before you can register a storage client with Tozny platform you will need to [sign up for a Tozny Platform account](https://dashboard.tozny.com/register). Create a registration token and inject it into your code.

```js
const token = '...'

async function main(name) {
  try {
    const cryptoKeys = await Tozny.crypto.generateKeypair()
    const signingKeys = await Tozny.crypto.generateSigningKeypair()
    const clientInfo = await Tozny.storage.register(
      token,
      name,
      cryptoKeys,
      signingKeys
    )

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
  } catch (e) {
    console.error(e)
  }
}
main('example-client')
```

You can optionally back up the client credentials with the account owner. When credentials are registered with an account backup, the clients configuration is encrypted and shared with the account. In the [Tozny Dashboard](https://dashboard.tozny.com/) the account owner will have access to the client credentials and record tools for this client.

```js
const clientInfo = await Tozny.storage.register(
  token,
  name,
  cryptoKeys,
  signingKeys,
  true
)
```

#### Load Existing Client

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

#### Write, Read, Update, Delete

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
        instrument: 'Trumpet',
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
  } catch (e) {
    console.error(e)
  }
}

main()
```

#### Basic Search records

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
      console.log(
        `Found record ${record.meta.recordId}: ${record.data.first_name} plays ${record.meta.plain.instrument}`
      )
    }
  } catch (e) {
    console.error(e)
  }
}

main()
```

#### Advanced Search records

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
      .match({ type: 'musicians', key: 'instrument' }, 'AND', 'EXACT')
      .match({ type: 'music' }, 'OR', 'FUZZY')
      .exclude({ records: ['...', '...'], writers: client.config.clientId })
      .range(oneWeekAgo, Date.now(), 'MODIFIED')
    const resultQuery = await writer.search(request)
    const found = await resultQuery.next()
    for (let record of found) {
      console.log(
        `Found record ${record.meta.recordId}: ${record.data.first_name} plays ${record.meta.plain.instrument}`
      )
    }
  } catch (e) {
    console.error(e)
  }
}

main()
```

#### Share or Revoke Access to a Record Type With Another Client

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
  } catch (e) {
    console.error(e)
  }
}

main()
```

#### Authorize or Deauthorized Another Client to Share on Your Behalf

```js
const client = new Tozny.storage.Client(/* config */)
const authorizerClient = new Tozny.storage.Client(/* config */)
const shareToId = '000000000000-0000-0000-0000-000000000'
const typeToShare = 'shared-type'

async function main() {
  try {
    await client.addAuthorizer(typeToShare, authorizerClient.config.clientId)
    console.log(
      `${authorizerClient.config.clientId} authorized to share ${typeToShare} on behalf of ${client.config.clientId}`
    )
    await authorizerClient.shareOnBehalfOf(client.config.clientId, typeToShare, shareToId)
    console.log(`${typeToShare} shared with ${shareToId}`)
    await authorizerClient.revokeOnBehalfOf(client.config.clientId, typeToShare, shareToId)
    console.log(`${typeToShare} no longer shared with ${shareToId}`)
    await client.removeAuthorizer(typeToShare, authorizerClient.config.clientId)
    console.log(
      `${authorizerClient.config.clientId} no longer authorized to share ${typeToShare} on behalf of ${client.config.clientId}`
    )
  } catch (e) {
    console.error(e)
  }
}

main()
```

### Files

Files are a special type of Tozny Storage record that has additional meta data attached which connects you with a content blob of up to 5GB. File records will be returned from search, just as any other record. However, the blob itself is only available when using the Files API in the Tozny Storage client.

Due to the fact that browsers and Node have _very_ different primitives available when it comes to files and the file system, the inputs and outputs fro the Files API in our Javascript SDK varies by platform. These environment specific differences are called out as they come up.

#### Write a File

```js
const client = new Tozny.storage.Client(/* config */)
const type = 'large-file'
const meta = { plaintext: 'metadata' }
const fileHandle = getFileHandle() // Platform specific!

async function main() {
  try {
    // This returns a File object, which contains the written record
    const file = await client.writeFile(type, handle, meta)
    // This fetches the record out of the File object
    const record = await file.record()
    console.log(`Wrote file to record ${record.meta.recordId}.`)
  } catch (e) {
    console.error(e)
  }
}

main()
```

_**Platform Notes**_

> _Node:_ In Node, a file handle is any [Readable Stream](https://nodejs.org/api/stream.html#stream_readable_streams). This can come from `fs.createReadStream`, an HTTP request or be created on the fly.
>
> _Browser:_ In Browsers, a file handle is a [Blob](https://developer.mozilla.org/en-US/docs/Web/API/Blob) object. This could come from a file input element, created from a fetch response, or even custom constructed.

#### Read a File

```js
const client = new Tozny.storage.Client(/* config */)
const fileId = '000000000000-0000-0000-0000-00000000'

async function main() {
  try {
    // This could be a record ID, or a file Record object
    const file = await client.getFile(fileId)
    // Once you have a File object, you can do various things
    // depending on the needs of your program. Normally a helper is
    // used read the file instead of calling `.read()` directly.
    // See platform notes for available helpers in each platform.
    const handle = await file.read() // Platform specific return.
  } catch (e) {
    console.error(e)
  }
}

main()
```

_**Platform Notes**_

> _Node:_ In Node, the handle returned is a [Readable Stream](https://nodejs.org/api/stream.html#stream_readable_streams). This can be piped to a writable stream, saved to disk using the fs module, or consumed by any code that accepts a readable stream.
>
> _Browser:_ In Browsers, the handle returned is a [ReadableStream](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream). This is _different_ than a Node readable stream, and is native to browsers. Read the linked MDN documentation for more information on what can be done with a ReadableStream. The platform helpers provided allow for easier processing so you do not have to concern yourself with the ReadableStream unless you want to.

#### Helpers

##### Browser

_URL_<br />
Takes a File object and a MIME Type and creates an object URL for the file. This is useful for things such as displaying an image, video, or offering the file as a download. Note that object URLs can use a lot of memory, so when your program no longer needs the URL make sure to revoke it with `window.URL.revokeObjectURL(url)`.

```js
const file = await client.getFile(fileId)
const url = await Tozny.helpers.fileAsUrl(file, 'image/jpeg')
```

_Blob_<br />
Takes a File object and returns a Blob with the supplied MIME Type.

```js
const file = await client.getFile(fileId)
const blob = await Tozny.helpers.fileAsBlob(file, 'application/octet-stream')
```

_Buffer_<br />
Takes a File object and returns an ArrayBuffer containing the entire contents of the file. You will need to add a [TypeArray view on the ArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray) to get access to the raw contents.

```js
const file = await client.getFile(fileId)
const buffer = await Tozny.helpers.fileAsBuffer(file)
const byteArray = new Uint8Array(buffer)
```

_Text_<br />
Takes a File object and returns the raw text as a UTF-8 string.

```js
const file = await client.getFile(fileId)
const fileText = await Tozny.helpers.fileAsText(file)
```

_JSON_<br />
Take a File object and returns a JSON parsed object from the file contents. UTF-8 encoding is assumed.

```js
const file = await client.getFile(fileId)
const fileObj = await Tozny.helpers.fileAsJSON(file)
console.log(fileObj.myData)
```

#### Node

_Save the file to disk_<br />
Takes a File object, a path, and an options object. This saves the file to the specified path with the provided options. This is an abstraction over the [createWriteStream](https://nodejs.org/api/fs.html#fs_fs_createwritestream_path_options) method from Node core. Review the `createWriteStream` documentation for available options.

```js
const file = await client.getFile(fileId)
const record = await file.record()
const url = await Tozny.helpers.saveFile(file, `./${record.meta.fileName}`, {
  encoding: `${record.meta.encoding}`,
  mode: 0o644,
})
console.log('File saved!')
```

#### Examples

##### Write a File Record Using a Form

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Upload File</title>
  </head>
  <body>
    <div>
      <h1>Upload File</h1>
      <form id="uploadForm">
        <p>
          <label for="fileToUpload">Select a file:</label><br />
          <input name="fileToUpload" id="fileToUpload" type="file" /><br />
        </p>
        <p>
          <button>Upload</button>
        </p>
      </form>
    </div>
    <div id="results"></div>
    <script src="https://unpkg.com/@toznysecure/sdk@{{{VERSION}}}/dist/tozny-sodium.min.js"></script>
    <script>
      const form = document.getElementById('uploadForm')
      const results = document.getElementById('results')
      const creds = {
        /*...Tozny Client Credentials...*/
      }
      const client = new Tozny.storage.Client(
        Tozny.storage.Config.fromObject(creds)
      )
      form.addEventListener('submit', (e) => {
        e.preventDefault()
        results.innerHTML = ''
        const formData = new FormData(form)
        const selectedFile = formData.get('fileToUpload')
        async function upload(blob) {
          try {
            const file = await client.writeFile('test-file', blob, {
              test: 'meta',
            })
            const record = await file.record()
            const h2 = document.createElement('H2')
            const pre = document.createElement('PRE')
            h2.innerText = 'File Uploaded'
            pre.innerText = JSON.stringify(record, undefined, '  ')
            results.appendChild(h2)
            results.appendChild(pre)
          } catch (e) {
            console.error(e)
          }
        }
        upload(selectedFile)
      })
    </script>
  </body>
</html>
```

##### Display a file as an Image

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Display Encrypted Image</title>
  </head>
  <body>
    <div>
      <h1>Display Encrypted Image</h1>
      <form id="downloadForm">
        <p>
          <label for="recordId">Record ID:</label><br />
          <input type="text" name="recordId" id="recordId" />
        </p>
        <p><button>Download</button></p>
      </form>
    </div>
    <div id="downloadResult"></div>
    <script src="https://unpkg.com/@toznysecure/sdk@{{{VERSION}}}/dist/tozny-sodium.min.js"></script>
    <script>
      const form = document.getElementById('downloadForm')
      const result = document.getElementById('downloadResult')
      const creds = {
        /*...Tozny Client Credentials...*/
      }
      const client = new Tozny.storage.Client(
        Tozny.storage.Config.fromObject(creds)
      )
      let currentURL
      form.addEventListener('submit', (e) => {
        e.preventDefault()
        const formData = new FormData(form)
        const recordId = formData.get('recordId')
        async function download(blob) {
          try {
            const file = await client.getFile(recordId)
            if (currentURL) {
              result.innerHTML = ''
              // Make sure to revoke URLs we no longer need!
              window.URL.revokeObjectURL(currentURL)
            }
            currentURL = await Tozny.helpers.fileAsUrl(file)
            const img = document.createElement('IMG')
            img.src = currentURL
            result.appendChild(img)
          } catch (e) {
            console.error(e)
          }
        }
        download(recordId)
      })
    </script>
  </body>
</html>
```

##### Provide a downloadable Link

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Download Encrypted File</title>
  </head>
  <body>
    <div>
      <h1>Download Encrypted File</h1>
      <form id="downloadForm">
        <p>
          <label for="recordId">Record ID:</label><br />
          <input type="text" name="recordId" id="recordId" />
        </p>
        <p><button>Decrypt</button></p>
      </form>
    </div>
    <p>
      Right click and save the file with the link below after decrypting the
      file.
    </p>
    <div id="downloadLink"></div>
    <script src="https://unpkg.com/@toznysecure/sdk@{{{VERSION}}}/dist/tozny-sodium.min.js"></script>
    <script>
      const form = document.getElementById('downloadForm')
      const result = document.getElementById('downloadLink')
      const creds = {
        /*...Tozny Client Credentials...*/
      }
      const client = new Tozny.storage.Client(
        Tozny.storage.Config.fromObject(creds)
      )
      form.addEventListener('submit', (e) => {
        e.preventDefault()
        const formData = new FormData(form)
        const recordId = formData.get('recordId')
        async function download(blob) {
          try {
            const file = await client.getFile(recordId)
            const url = await Tozny.helpers.fileAsUrl(file)
            const a = document.createElement('A')
            a.href = url
            a.download = true
            // Note, one issue in browser to be aware of. There is no way to tell
            // when a download is complete. However, if you revoke the Object URL
            // before it is complete, the download will fail. Be sure to research
            // The latest best practices for revoking object URLs used to offer
            // downloads to the user.
            result.appendChild(a)
          } catch (e) {
            console.error(e)
          }
        }
        download(recordId)
      })
    </script>
  </body>
</html>
```

### Notes

Notes provide a mechanism transfer or save data encrypted for a single specified set of cryptographic keys. These keys may or may not belong to another client in the TozStore system. This is a one way transfer. The writer of a note can update or delete the note contents, but they can not read it. The reader of the note can read it, but can not update or delete it. The writer and reader keys on a note can be the same.

#### Write, Read, and Delete

```js
const client = new Tozny.storage.Client(/* config */)

async function main() {
  try {
    // data to encrypt, public encryption key, public signing key, storage and metadata options
    const written = await client.writeNote(
      {
        lyric1: 'What a wonderful world',
        lyric2: 'Oh, the shark, babe, has such teeth, dear',
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
  } catch (e) {
    console.error(e)
  }
}

main()
```

#### Replace a Named Note

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
        lyric3: 'I done forgot the words',
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
  } catch (e) {
    console.error(e)
  }
}

main()
```

## TozStore Secure Computation

TozStore Secure Computations allow users to run computations on encrypted data. In order to run a computation, a user must be _subscribed_ to it. <br>
A computation takes the encrypted data, runs a specific analysis on it, and writes the resulting analysis to a record that only subscription _managers_ have access to.

### Subscribe to a Computation:

You must have the client ID for the client subscribing to the computation, as well as the computation ID. When subscribing to a computation, you can optionally pass in client IDs for any clients you wish to make a manager.

```js
try {
  const subscriptionRequest = {
    ToznyClientID: clientID,
    ComputationID: computationID,
    SubscriptionManagers: [],
  }
  const subscription = await client.subscribeToComputation(subscriptionRequest)
  console.log(subscription)
} catch (e) {
  console.error(e)
}
```

If successful, `subscribeToComputation()` will return an object that contains the `computation ID`, as well as a list of `recordTypesRequired`, which indicate the type (or types) of record required to run the computation, as well as the client ID with whom the records must be shared. If unsuccessful, it will throw an error.

### Fetch all Subscribed Computations

```js
try {
  const fetchSubscriptionsRequest = {
    ToznyClientID: clientID,
  }
  let subscriptions = await client.fetchSubscriptionsToComputations(
    fetchSubscriptionsRequest
  )
  console.log(subscriptions)
} catch (e) {
  console.error(e)
}
```

If successful, `fetchSubscriptionsToComputations()` will return a list of all computations that the client whose ID is provided is subscribed to, otherwise it will throw an error.

### Fetch all Available Computations

```js
try {
  let subscriptions = await client.fetchAvailableComputations()
  console.log(subscriptions)
} catch (e) {
  console.error(e)
}
```

If successful, `fetchAvailableComputations()` will return a list of all computations available, otherwise it will throw an error.

### Unsubscribe From a Computation

```js
try {
  const unsubscribeRequest = {
    ToznyClientID: clientID,
    ComputationID: computationID,
  }
  let unsubscribed = await client.unsubscribeFromComputation(unsubscribeRequest)
  console.log(unsubscribed)
} catch (e) {
  console.error(e)
}
```

`unsubscribeFromComputation()` will return `true` if the client has successfully been unsubscribed.

### Run an Analysis

```js
try {
  let data = new Map([['key', 'val']])
  let analysisRequest = {
    ComputationID: computationID,
    ToznyClientID: clientID,
    DataStartTimestamp: start,
    DataEndTimestamp: end,
    DataRequired: data,
  }
  let analysis = await client.computeAnalysis(analysisRequest)
  console.log(analysis)
} catch (e) {
  console.error(e)
}
```

If there is extra data that is required for the computation to run, it must be included in the `DataRequired` field, in the form of key value pairs.

## Tozny Identity

### Configure a Connection to an Identity Realm

Before you can work with the Tozny Identity service, you need to [sign up for a Tozny Platform account](https://dashboard.tozny.com/register). Create a new identity realm and register a new client application with the realm.

```js
const realmName = '...'
const appName = '...'
// This is a URL in your application which handle password reset flows.
const brokerTargetURL = '...'

const realm = new Tozny.identity.Realm(realmName, appName, brokerTargetURL)
```

Once the realm is configured, it provide methods for interacting with identities belonging to that realm.

### Register an Identity

```js
const realm = new Tozny.identity.Realm('...', '...', '...')
const token = '...' // A registration token from your Tozny Platform account

async function main(username, password, emailAddress) {
  try {
    // username and email address can be the same for ease of use
    const identity = await realm.register(
      username,
      password,
      token,
      emailAddress
    )
    // Perform operations with the registered identity.
  } catch (e) {
    console.error(e)
  }
}

main('user', 'password', 'user@example.com')
```

### Log in an Identity

To log in, a user needs an identity token. This token allows fetching of the encrypted stored identity configuration. First login will gather an OIDC login URL which will issue a token to your application.

```js
const realm = new Tozny.identity.Realm('...', '...', '...')

async function main(username, password) {
  try {
    const redirectURL = '...' // this URL handles the redirect from the OIDC login and extracts the included authentication token.
    const loginRequest = await realm.login(username, password, redirectUrl)
    window.location = loginRequest.redirect
  } catch (e) {
    console.error(e)
  }
}

main('user', 'password')
```

The identity service will then request all required information for the user logging and send the user back to the `redirectUrl` provided including an identity authentication token.

```js
const realm = new Tozny.identity.Realm('...', '...', '...')
const authToken = '...' // parsed from the returned URL

async function main(username, password, authToken) {
  try {
    const identity = await realm.completeLogin(username, password, authToken)
    // Perform operations with the registered identity.
  } catch (e) {
    console.error(e)
  }
}

main('user', 'password')
```

### Save an Identity Locally

After logging an identity in, it is useful to cache and store it. Without doing this, a refresh or reload of the page or environment will require the user to log in again. Storing the session in something like local storage allows the session to persist.

```js
const realm = new Tozny.identity.Realm('...', '...', '...')
// Gather an identity from login, register, etc...

async function main(identity) {
  try {
    let serialized = identity.stringify()
    localStorage.setItem('stored-identity', serialized)
    // on the next load
    serialized = localStorage.getItem('stored-identity')
    identity = realm.fromObject(serialized)
    // Perform operations with the registered identity.
  } catch (e) {
    console.error(e)
  }
}

main(identity)
```

### Reset a User's Password Via Email

To reset a user's password via email, they must be registered with a valid email address. In addition, a trusted broker client must be set up for the realm. Tozny provides a hosted broker client which can facilitate resets on your behalf. To enable this support, turn on the switch for Email Recovery Enabled for your realm in the Tozny dashboard.

First, initiate a reset, which will send an email to the user. When registering the user, you must provide a valid application URL which will handle the link from the email sent.

```js
const realm = new Tozny.identity.Realm('...', '...', '...')

async function main(username) {
  try {
    await realm.initiateRecovery(username)
    // a return of true indicates a successful request.
  } catch (e) {
    console.error(e)
  }
}

main('user')
```

_An email will only be sent if the user is a member of the requesting realm with a valid email address._

When the user clicks the email, the application link you provided will be hit with query parameters for `email_otp` and `note_id`. Parse these from the URL.

```js
const realm = new Tozny.identity.Realm('...', '...', '...')
const parsedOTP = '...'
const parsedId = '...'

async function main(otp, noteId) {
  try {
    const identity = await completeEmailRecovery(otp, noteId)
    // Perform operations with the registered identity.
  } catch (e) {
    console.error(e)
  }
}

main(parsedOTP, parsedId)
```

### Managing Multi-factor Authentication Devices

The SDK can manage the MFA devices of the identity.

#### List MFA Devices of Identities

An authenticated identity client can lookup details on the MFA devices registered to themselves or other users.

The method takes an optional `searchParams`. If no search params are used, the search method will default to searching for the currently authenticated identity's MFA devices.

Note that although the response supports a list of devices, only one TOTP device and one WebAuthn device is currently supported per identity.

```js
const identity = await realm.login('username', 'password')
// no searchParams will default to current identity's MFA devices.
const mfaDevices = await identity.searchIdentityMFADeviceCredentials(realmName)
// example response: note that the result is in a list
// [{
//   "toznyId": "80037966-2168-40a3-a445-4933c72ed9be",
//   "userId": "48dfd438-f022-4e25-b6fe-96fa83abda88",
//   "mfaDevices": {
//     "totp": [
//       {
//         "id": "d6031959-14c0-4a3c-846d-4255e91836b5",
//         "type": "otp",
//         "userLabel": "totp",
//         "createdAt": "2022-02-18T21:40:47.122Z"
//       }
//     ],
//     "webauthn": [
//       {
//         "id": "1bc6a54a-2765-4130-9b29-68dc47a13e1f",
//         "type": "webauthn",
//         "userLabel": "My WebAuthnDevice",
//         "createdAt": "2022-02-18T21:44:02.022Z"
//       }
//     ]
//   }
// }]
```

A realm admin can view the MFA devices of other users in their realm. An identity's MFA devices can be searched for by their user ID (`userIds`) or by their Tozny storage client ID (`toznyIds`).

```js
const adminIdentity = await realm.login('usernameOfAdmin', 'password')

// search by user ids or Tozny storage client ids
// one, both, or neither of the search parameter id lists can be used.
const searchParams = {
  userIds: ['user-id-here'],
  toznyIds: ['tozny-id-here'],
}
const mfaDevices = await identity.searchIdentityMFADeviceCredentials(
  realmName,
  searchParams
)
// returns list containing one item per identity found.
```

#### Register a WebAuthn Device

The identity client is capable of programatically registering a WebAuthn-compatible device such as a FIDO2 hardware security key. The process is first initiate the registration flow by requesting some challenge data from the server. Then, using the `navigator` API, the user signs the challenge data with their device, and the device is registered and persisted to the user's identity.

Currently, the SDK only support registering a device for the authenticated client's user.

```js
const identity = await realm.login('username', 'password')

// fetch the challenge and public key creation parameters
const challengeData = await identity.initiateWebAuthnChallenge()

// request the user to sign the challenge data with their hardware security key
const registrationData = await navigator.credentials.create({
  publicKey: challengeData.toPublicKeyCredentialCreationOptions(),
})

// finalize the device registration
// if successful, the response will contain all the user's MFA devices.
const response = await identity.registerWebAuthnDevice(
  registrationData,
  'User-friendly label for device',
  // a tab id is returned with the initial challenge data.
  // it is a security measure to ensure that the same user session that initiated the challenge flow
  // is the one completing it.
  challengeData.tabId
)
```

#### Remove an MFA Device

An authenticated identity client can remove an MFA device registered to themselves or other users.

```js
const identity = await realm.login('username', 'password')

// fetch the identity's MFA devices
const mfaDevices = await identity.searchIdentityMFADevicesCredentials(realmName)

// delete the WebAuthn MFA device, `resp` is an empty object {success: true} if successful
const resp = await identity.removeMFADevice(mfaDevices.webAuthn[0].id)
```

A realm admin can delete MFA devices of other users in their realm.

```js
const identity = await realm.login('usernameOfAdmin', 'password')

// fetch an identity's MFA devices as the realm admin
const searchParams = {
  userIds: ['user-id-here'],
  toznyIds: ['tozny-id-here'],
}

const mfaDevices = await identity.searchIdentityMFADeviceCredentials(
  realmName,
  searchParams
)

// delete the WebAuthn MFA device, `resp` is an empty object {success: true} if successful
const resp = await identity.removeMFADevice(mfaDevices.webAuthn[0].id)
```

### Perform Operations Using the Identity Token

Once you have an identity, you can use it to get JWTs for the configured application, perform Tozny Storage operations with the identities' storage credentials, or change the password for the identity.

```js
const serialized = localStorage.getItem('stored-identity')
const identity = realm.fromObject(serialized)

async function main() {
  try {
    const jwtInfo = await identity.tokenInfo() // full info including auth token, expiration, etc.
    const jwt = await identity.token() // the raw bearer token to use in requests, automatically refreshed
    const response = await identity.fetch('http://myAPI.com/some/endpoint', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ data: 'special data to send' }),
    }) // a basic fetch call made with the bearer token in the Authentication header
    // To change a password for an identity user:
    identity.changePassword('newPassword')
    // Tozny Storage operations are available as well
    const record = await identity.storage.writeRecord(
      'musician',
      {
        first_name: 'Buddy',
        last_name: 'Rich',
        phone: '555-555-9383',
      },
      {
        instrument: 'drums',
      }
    )
    console.log(`Wrote record: ${record.meta.recordId}`)
  } catch (e) {
    console.error(e)
  }
}

main()
```

### Privileged Access Management & Multi-party control

TozID supports multi-party controlled groups. A group can be given an access policy that configures
an approval flow in which users can request access to join the group and users with the correct
approver roles can approve the request for access. The identity client is capable of programatically
managing these requests for access.

Due to the increased permissions required for setting up the access policies, they must be setup
manually from the Realm admin portal, or programatically with the `js-account-sdk`:

- [configure a group's access policies](https://github.com/tozny/js-account-sdk/blob/master/doc/classes/Client.md#upsertaccesspoliciesforgroup)
- [list the access policies of groups](https://github.com/tozny/js-account-sdk/blob/master/doc/classes/Client.md#listaccesspoliciesforgroups)

**The realm & groups must be configured for multi-party control in order to make use of the following
access request functionality.**

All example code is presumed to be inside of an `async` function with an authenticated `identity` client.

#### Overview of Access Requests

An `AccessRequest` is a representation of a user requesting access to a particular group.

Currently, only one group per access request is supported, though the data structure uses an array to
be forward-compatible with potentially requesting access to multiple groups in a single request.

##### Example Access Request

```js
const accessRequest = {
  /** identifier of the access request */
  id: 159,
  /** list of group info. currently, only one group is supported */
  groups: [
    {
      id: 'f54ee4c1-8cf6-482e-9bd6-a5b2129e8e5d',
      groupName: 'special-privilege-group',
    },
  ],
  /** name of realm containing group */
  realmName: 'realmName',
  /** state of request. "open", "approved", or "denied" */
  state: 'open',
  /** user-defined reason they want access */
  reason: "I'd like access to do X, Y, & Z.",
  /** number of seconds access will last once approved */
  accessDurationSeconds: 86400,
  /** information about who made the request */
  requestor: {
    toznyId: 'a7a128c5-6cde-4e22-a2e3-24aa8370d1ef',
    username: 'RobertRequestor',
  },
  /** number of required approvals before request is fulfilled */
  requiredApprovalsCount: 1,
  /** past actions performed on the request, see below */
  actions: [],
  /** datetime at which the request will be automatically denied */
  autoExpiresAt: '2021-11-03T22:40:24.0582469Z',
  /** datetime at which the request was created */
  createdAt: '2021-11-01T22:40:24.058459Z',
}
```

##### Example Access Request Action

An action is created for each approval/denial that happens to the request:

```js
const action = {
  /** type of action: "approve", "deny" */
  action: 'approve',
  /** information about who performed the action */
  user: {
    toznyId: 'a7a128c5-6cde-4e22-a2e3-24aa8370d1ef',
    username: 'AlannaApprover',
  },
  /** datetime at which the action was taken */
  takenAt: '2021-10-26T18:54:26.707336Z',
  /** optional comment from the acting user */
  comment: '',
}
```

#### Enumerating access-controlled groups

Get info on all the groups governed by an access policy with `availableAccessRequestGroups`:

```js
const groups = await identity.availableAccessRequestGroups(realmName)
//=> array of items like { id, groupName, accessPolicies }
// where accessPolicies is an array of objects { id, maxAccessDurationSeconds, requiredApprovals }
```

### Listing Access Requests

There is search functionality for enumerating existing open & historical access requests. The access
requests returned are dependent on the `identity` querying for them.

#### Actionable Requests

By default, all & only the access requests the user can or could act on (approve or deny) are returned:

```js
const accessRequestsUserCanOrCouldApprove =
  await identity.searchAccessRequests()
```

This include both pending `open` and historical `approved`/`denied` ones.

#### Requests created by a particular user

`searchAccessRequests` accepts a filter that can contain a list of `requestorIds` that can be used
to enumerate the requests from a particular user.

```js
// all access requests this identity created
const toznyIdOfUser = identity.storage.config.clientId
const accessRequestsCreatedByUser = await identity.searchAccessRequests({
  requestorIds: [toznyIdOfUser],
})

// or those created by a different identity
const username = 'RobertRequestor'
const otherUser = await identity.searchIdentityByUsername(username)
const accessRequestsCreatedByOtherUser = await identity.searchAccessRequests(
  { requestorIds: [otherUser.client_id] } // Note: client id, not user id
)
```

Note that only those requests the current `identity` has permission to view are returned.
An Access Request not created or actionable by the requesting identity will be excluded.

#### Requesting Access

With the `identity` of the user who wants access to the group, you can create a request for access:

```js
const realmName = 'NameOfRealmGoesHere'
const groupInfo = { id: groupId }
const reason = 'This is the user-defined reason for requesting access!'
const accessDurationSeconds = 24 * 3600 // number of seconds access will be granted for if approved
const newAccessRequest = await identity.createAccessRequest(
  realmName,
  [groupInfo], // array of group info, currently only one is supported.
  reason,
  accessDurationSeconds
)
```

Note that the `accessDurationSeconds` may be capped by the server.

#### Approving or Denying a Request

```js
const realmName = 'NameOfRealmGoesHere'
const accessRequestId = accessRequest.id
const comment = 'Completely optional comment'

// approve an access request
const approvedRequest = await identity.approveAccessRequests(realmName, [
  { accessRequestId, comment },
])

// or deny it
const deniedRequest = await identity.denyAccessRequests(realmName, [
  { accessRequestId, comment },
])
```

Both `approveAccessRequests` and `denyAccessRequests` accept a list of objects with `accessRequestId`
and an optional `comment`. They are capable of approving/denying in bulk.

### TozStore Groups

Groups allow users to share encrypted data with multiple clients, without having to manually share each record.<br>
Any client can create a group and can be added to an existing group. The creator of the group will automatically be given management capabilities, and may optionally pass in read and/or write capabilities during group creation.<br><br>

#### Create a group:

```js
const Tozny = require('@toznysecure/sdk/node')
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
// Create a group, giving read and share capabilities to the client.
// Management capabilities will also be set by default.
const example_group = await client.createGroup(
  'ExampleGroup',
  ['READ_CONTENT', 'SHARE_CONTENT'],
  'Example Description'
)
```

The call to `createGroup()` will return a GroupMembership object with the following fields: <br>

```js
clientID,
group: Group {
  groupName,
  publicKey,
  description,
  createdAt,
  lastModified,
  groupID,
  accountID,
  memberCount
},
capabilities: {}
```

These fields can be used as parameters to various groups functions. The group ID is particularly useful for this.<br>
Get the groupID from the GroupMembership object returned:

```js
const groupID = example_group.group.groupID
```

#### Add one or more group members:

```js
// List group members before adding new members
let members = await client.listGroupMembers(groupID)
console.log('Before adding new member, group members = \n', members)
// Create GroupMember objects for client2 and client3
const client2GroupMember = new types.GroupMember(client2ID, {
  share: true,
  manage: false,
  read: true,
})
const client3GroupMember = new types.GroupMember(client3ID, {
  share: true,
  manage: false,
  read: true,
})
// Add new members to the group
const addedMembers = await client.addGroupMembers(groupID, [
  client2GroupMember,
  client3GroupMember,
])
console.log('Members added = \n', addedMembers)
// List group members after adding new members
members = await client.listGroupMembers(groupID)
console.log('After adding new member, group members = \n', members)
```

`addGroupMembers()` will return a list of GroupMember objects, one for each member added. Each GroupMember object contains the added member's client ID (`client_id`), membership key (`membership_key`) and a list of their capabilities for that group (`capability_names`)<br><br>

#### Delete one or more group members:

```js
// List group members before deletion
let members = await client.listGroupMembers(groupID)
console.log('Before deleting group member, members = \n', members)
try {
  // Remove client2 from group
  const isDeleted = await client.removeGroupMembers(groupID, [client2ID])
  if (isDeleted) {
    // List group members after deletion
    members = await client.listGroupMembers(groupID)
    console.log('After deleting group member, members = \n', members)
  }
} catch (e) {
  console.error(e)
}
```

`removeGroupMembers()` will return true if removal was successful and will otherwise throw an error.<br><br>

#### Get a single group's info:

```js
let groupInfo = await client.readGroup(groupID)
```

This can also be accomplished using a group's name:

```js
let groupInfo = await client.groupInfo('ExampleGroup')
```

`readGroup()` and `groupInfo()`will return a Group object containing the group's name, public key, description, creation timestamp, last modified timestamp, group ID, account ID, and the number of members.<br><br>

#### List all groups for a client:

```js
const groups = await client.listGroups()
```

`listGroups()` will return a list of Group objects. Optional parameters are: `clientID`, `groupNames` (an array of strings to filter the response by), `nextToken` (where to start pagination of results), and `max` (the maximum number of results returned per request).<br><br>

#### Share a record with a group and list shared records:

```js
// Share records of type 'musician' with a group
// client must have share capabilities for this group
let sharedRecord = await client.shareRecordWithGroup(groupID, 'musicians')
console.log(`${sharedRecord.record_type} shared with group ${groupID}`)
// List all records shared with a group.
// client2 must have read capabilities for this group
let records = await client2.listRecordsSharedWithGroup(groupID)
console.log(records)
```

`listRecordsWithGroup()` will return a list of Record objects. Optional arguments are writerIds (an array of client IDs used for filtering writers), nextToken (where to start pagination of results), and max (maximum number of results returned per request).<br><br>

#### Revoke records shared with a group:

```js
try {
  let isRevoked = client.revokeRecordWithGroup(groupID, 'musicians')
  if (isRevoked) console.log('Records have been successfully revoked')
} catch (e) {
  console.error(e)
}
```

`revokeRecordWithGroup()` will return true if the record is successfully revoked and will otherwise throw an error. <br><br>

#### Delete a group:

```js
try {
  let isDeleted = await client.deleteGroup(groupID)
  if (isDeleted) console.log(`Group ${groupID} has been deleted`)
} catch (e) {
  console.error(e)
}
```

`deleteGroup()` will return true if the group is successfully removed and will otherwise throw an error. <br><br>

## Terms of Service

Your use of the Tozny JavaScript SDK must abide by our [Terms of Service](https://tozny.com/tozny-terms-of-service/), as detailed in the linked document.
