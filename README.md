# E3DB JavaScript SDK Client Interface

The Tozny End-to-End Encrypted Database (E3DB) is a storage platform with powerful sharing and consent management features.

[Read more on our blog.](https://tozny.com/blog/announcing-project-e3db-the-end-to-end-encrypted-database/)

This repository contains interfaces and code providing the core of the Tozny platform JS SDKs. It defines types, API
behaviors, and more to keep interactions consistent across the various code bases, yet allowing each SDK to define the cryptography layer and any context specific helpers for use in the target environment.

## Use

Import this package

```sh
npm install --save e3db-client-interface
```

Create a concrete crypto implementation.

```js
// crypto.js
import { Crypto as BaseCrypto } from 'e3db-client-interface'

export default class Crypto extends BaseCrypto{
  // implement the crypto for each of the methods.
}
```

Create a concrete client implementation

```js
// client.js
import Crypto from './crypto'
import { Client as ClientBase } from 'e3db-client-interface'

// instantiate a concrete crypto instance
const crypto = new Crypto()

export default class Client {
  // overload the getter for crypto to return the concrete instance
  static get crypto() {
    return crypto
  }
}
```

Finally to make the standard Tozny platform primitives available from the implementing package by exporting the constructors and helpers.

```js
// index.js
export { default as Client } from './client'
export { Config, types } from 'e3db-client-interface'

// optionally export context specific helpers
export { default as helpers } from './helpers'
```


## Terms of Service

Your use of E3DB must abide by our [Terms of Service](https://github.com/tozny/e3db-java/blob/master/terms.pdf), as detailed in the linked document.
