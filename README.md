[![Build Status](https://travis-ci.org/tozny/js-sdk.svg?branch=master)](https://travis-ci.org/tozny/js-sdk)

# Tozny's JavaScript Software Developers Kit

The Tozny Platform offers powerful tools for developers, enabling them to incorporate strong end-to-end encryption into their code bases. The Software Developer Kits provide the tools necessary for implementing the Tozny Platform without needing high cryptography expertise.

## Install and Set Up

```sh
npm install --save @toznysecure/sdk
```

**Node**

```js
const Tozny = require('@toznysecure/sdk/node')
```

_Note: Requires Node 8.3+. Older versions may work depending on the features used._

**Browser: ES6**

```js
import Tozny from '@toznysecure/sdk/browser'
```

**Browser: Script Tag**

```html
<script type="text/javascript"  src="https://unpkg.com/@toznysecure/sdk@<version>/dist/tozny-sodium.min.js"></script>
<script type="text/javascript">
  // Tozny global is now available
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
    const cryptoKeys  = await Tozny.crypto.generateKeypair();
    const signingKeys = await Tozny.crypto.generateSigningKeypair();
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

#### Files

Files are a special type of Tozny Storage record that has additional meta data attached which connects you with a content blob of up to 5GB. File records will be returned from search, just as any other record. However, the blob itself is only available when using the Files API in the Tozny Storage client.

Due to the fact that browsers and Node have _very_ different primitives available when it comes to files and the file system, the inputs and outputs fro the Files API in our Javascript SDK varies by platform. These environment specific differences are called out as they come up.

**Write a file**

```js
const client = new Tozny.storage.Client(/* config */)
const type = 'large-file'
const meta = {plaintext: 'metadata'}
const fileHandle = getFileHandle() // Platform specific!

async function main() {
  try {
    // This returns a File object, which contains the written record
    const file = await client.writeFile(type, handle, meta)
    // This fetches the record out of the File object
    const record = await file.record()
    console.log(`Wrote file to record ${record.meta.recordId}.`)
  } catch(e) {
    console.error(e)
  }
}

main()
```

_**Platform Notes**_

> _Node:_ In Node, a file handle is any [Readable Stream](https://nodejs.org/api/stream.html#stream_readable_streams). This can come from `fs.createReadStream`, an HTTP request or be created on the fly.
>
> _Browser:_ In Browsers, a file handle is a [Blob](https://developer.mozilla.org/en-US/docs/Web/API/Blob) object. This could come from a file input element, created from a fetch response, or even custom constructed.

**Read a File**

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
  } catch(e) {
    console.error(e)
  }
}

main()
```

_**Platform Notes**_

> _Node:_ In Node, the handle returned is a [Readable Stream](https://nodejs.org/api/stream.html#stream_readable_streams). This can be piped to a writable stream, saved to disk using the fs module, or consumed by any code that accepts a readable stream.
>
> _Browser:_ In Browsers, the handle returned is a [ReadableStream](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream). This is _different_ than a Node readable stream, and is native to browsers. Read the linked MDN documentation for more information on what can be done with a ReadableStream. The platform helpers provided allow for easier processing so you do not have to concern yourself with the ReadableStream unless you want to.

##### Helpers

**Browser**

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

**Node**

_Save the file to disk_<br />
Takes a File object, a path, and an options object. This saves the file to the specified path with the provided options. This is an abstraction over the [createWriteStream](https://nodejs.org/api/fs.html#fs_fs_createwritestream_path_options) method from Node core. Review the `createWriteStream` documentation for available options.


```js
const file = await client.getFile(fileId)
const record = await file.record()
const url = await Tozny.helpers.saveFile(
  file,
  `./${record.meta.fileName}`,
  { encoding: `${record.meta.encoding}`, mode: 0o644 }
)
console.log('File saved!')
```

##### Examples

**Write a file record using a form**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Upload File</title>
</head>
<body>
  <div>
    <h1>Upload File</h1>
    <form id="uploadForm">
      <p>
        <label for="fileToUpload">Select a file:</label><br />
        <input name="fileToUpload" id="fileToUpload" type="file" ><br />
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
    const creds = {/*...Tozny Client Credentials...*/}
    const client = new Tozny.storage.Client(Tozny.storage.Config.fromObject(creds))
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      results.innerHTML = ''
      const formData = new FormData(form)
      const selectedFile = formData.get('fileToUpload')
      async function upload(blob) {
        try {
          const file = await client.writeFile('test-file', blob, {test: 'meta'})
          const record = await file.record()
          const h2 = document.createElement('H2')
          const pre = document.createElement('PRE')
          h2.innerText = 'File Uploaded'
          pre.innerText = JSON.stringify(record, undefined, '  ')
          results.appendChild(h2)
          results.appendChild(pre)
        } catch(e) {
          console.error(e)
        }
      }
      upload(selectedFile)
    })
  </script>
</body>
</html>
```

**Display a file as an Image**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
    const creds = {/*...Tozny Client Credentials...*/}
    const client = new Tozny.storage.Client(Tozny.storage.Config.fromObject(creds))
    let currentURL
    form.addEventListener('submit', (e) => {
      e.preventDefault();
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
        } catch(e) {
          console.error(e)
        }
      }
      download(recordId)
    })
  </script>
</body>
</html>
```

**Provide a downloadable Link**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
  <p>Right click and save the file with the link below after decrypting the file.</p>
  <div id="downloadLink"></div>
  <script src="https://unpkg.com/@toznysecure/sdk@{{{VERSION}}}/dist/tozny-sodium.min.js"></script>
  <script>
    const form = document.getElementById('downloadForm')
    const result = document.getElementById('downloadLink')
    const creds = {/*...Tozny Client Credentials...*/}
    const client = new Tozny.storage.Client(Tozny.storage.Config.fromObject(creds))
    form.addEventListener('submit', (e) => {
      e.preventDefault();
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
        } catch(e) {
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

## Tozny Identity

**Configure a connection to an identity realm**

Before you can work with the Tozny Identity service, you need to [sign up for a Tozny Platform account](https://dashboard.tozny.com/register). Create a new identity realm and register a new client application with the realm.

```js
const realmName = '...'
const appName = '...'
// This is a URL in your application which handle password reset flows.
const brokerTargetURL = '...'

const realm = new Tozny.identity.Realm(realmName, appName, brokerTargetURL)
```

Once the realm is configured, it provide methods for interacting with identities belonging to that realm.

**Register an identity**

```js
const realm = new Tozny.identity.Realm('...', '...', '...')
const token = '...' // A registration token from your Tozny Platform account

async function main(username, password, emailAddress) {
  try {
    // username and email address can be the same for ease of use
    const identity  = await realm.register(username, password, token, emailAddress)
    // Perform operations with the registered identity.
  } catch(e) {
    console.error(e)
  }
}

main('user', 'password', 'user@example.com')
```

**Log in an identity**

To log in, a user needs an identity token. This token allows fetching of the encrypted stored identity configuration. First login will gather an OIDC login URL which will issue a token to your application.

```js
const realm = new Tozny.identity.Realm('...', '...', '...')

async function main(username, password) {
  try {
    const redirectURL = '...' // this URL handles the redirect from the OIDC login and extracts the included authentication token.
    const loginRequest  = await realm.login(username, password, redirectUrl)
    window.location = loginRequest.redirect
  } catch(e) {
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
    const identity  = await realm.completeLogin(username, password, authToken)
    // Perform operations with the registered identity.
  } catch(e) {
    console.error(e)
  }
}

main('user', 'password')
```

**Save an identity locally**

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
  } catch(e) {
    console.error(e)
  }
}

main(identity)
```

**Reset a user's password via email**

To reset a user's password via email, they must be registered with a valid email address. In addition, a trusted broker client must be set up for the realm. Tozny provides a hosted broker client which can facilitate resets on your behalf. To enable this support, turn on the switch for Email Recovery Enabled for your realm in the Tozny dashboard.

First, initiate a reset, which will send an email to the user. When registering the user, you must provide a valid application URL which will handle the link from the email sent.

```js
const realm = new Tozny.identity.Realm('...', '...', '...')

async function main(username) {
  try {
    await realm.initiateRecovery(username)
    // a return of true indicates a successful request.
  } catch(e) {
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
  } catch(e) {
    console.error(e)
  }
}

main(parsedOTP, parsedId)
```

**Perform operations using the identity token**

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
          'content-type': 'application/json'
        },
        body: JSON.stringify({data: 'special data to send'})
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
          instrument: 'drums'
        }
      )
      console.log(`Wrote record: ${record.meta.recordId}`)
    } catch(e) {
      console.error(e)
    }
  }

  main()
```

## Terms of Service

Your use of the Tozny JavaScript SDK must abide by our [Terms of Service](https://github.com/tozny/e3db-java/blob/master/terms.pdf), as detailed in the linked document.
