# Testing

The tests for this SDK must be run in a browser. Otherwise, the browser crypto API will not be able to generate cryptographically secure pseudo-random numbers and seed the crypto methods. Running the tests in Jest will fail, as Jest uses JSDOM and does not have the crypto API.

Currently, Tozny runs tests using Karma and Sauce Labs.

To run tests on your machine, you need a Sauce Labs Account. Then you need to export three environment variables:

export SAUCE_USERNAME=tozny
export SAUCE_ACCESS_KEY=<access_key>
export REGISTRATION_TOKEN=<from_tozny_dashboard>

You can then use the npm run test script to run the karma tests.

The Sauce Labs account is a Tozny ops account with a shared email, username, and password.

# Publishing

Checkout branch

Write code

Get code reviewed and approved

Use the npm build tool to automatically update package.json to the new version

```bash
# mainline release
npm version 1.0.1
# preview release
npm version 1.0.1-alpha.1
```

Use the npm build tool to make a new commit with the updated version, create a git tag to have as a github release, and push the package to npm for consumption

```bash
npm publish
```

If doing an alpha release,

```bash
npm publish --tag=alpha
```

Push the tag up to remote github repository

```bash
git push --tags --all
```

Lastly, merge and delete the branch
