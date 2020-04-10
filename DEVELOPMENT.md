# Development Guidelines

To contribute to the Tozny Platform JS SDK, review these guidelines carefully.

## Writing Code

### Linting and coding style

Code linting is provided by ES Lint, and coding style is managed with Prettier. Ensure all code is lint free and formatted code before submitting it to the Tozny Platform JS SDK.

### Types

In general, new types need to be added for any API return values. The exception is if the return is a collection of a defined type. In that instance, the return can be an array or typed objects. After defining a new type module, make sure it is added to the index.js file in the `/types/` folder so it is consumable by end users.

### Lib

This SDK supports both browser and node environments, but is customized for each. However, the vast majority of the code is shared between the environments. Keep code in this shared environment unless absolutely necessary. The environment specific code should include items that are provided by Node core and should not be polyfilled in a browser (such as Node's crypto module), or native browser APIs that are not available in the Node environment (such as `window.crypto`). File functionality is another example requiring a split in how the SDK must behave.

### Internal documentation

Internal documentation makes for a significantly superior developer experience when consuming the SDK. Most decent code editors will parse documentation comments and show hints to developers when they use the SDK methods. Newly added code to the SDK must have internal doc comments on all functions and files following the [JS Doc 3 style](https://devdocs.io/jsdoc/).

### CommonJS

This SDK is written using CommonJS modules. The code in the library is the same code that is ultimately consumed via NPM. This is significantly cleaner for consuming libraries than code that goes through transpiling before use. If a consumer needs to compile the code for platforms that do not have the full ES6 feature set used, it can be run through something like webpack, babel, etc. by the consumer.

Most ES6 features are natively supported by the targeted Node versions, but ES6 module support is not generally available yet. Use the [node.green](https://node.green/) table to check if you are unsure if a feature is natively supported, and [CanIUse](https://caniuse.com/) to check for native browser support.

A minified compiled version of the library added to the global object is provided for direct consumption by browser. A basic webpack configuration creates this compiled version, and it is included for convenience. After making changes, ensure you run a build before requesting a merge. Babel is not currently used to adjust the code support requirements.

## Building

A built version of the SDK is included for browsers. JS CDN pick up this file automatically making for easy distribution. Also, the compiled version and an environment HTML file is included in the repo to allow real-browser testing to ensure the SDK's compatibility. Immediately before tagging a release for NPM, make sure to run a build for distribution.

```sh
npm run build
```

For local testing, a dev version of the library is used to provide better error reporting. This is kept out of version control due to it's size, so before testing locally make sure to build the dev version.

```
npm run build:dev
```

When running `npm test` the dev build will automatically be run to make sure it is available for the tests with the latest SDK changes included.

## Testing

The Tozny Platform JS SDK targets both browsers and node environments. This makes testing more difficult than a library for a library that does not require environment splitting of functionality. Testing is run with [Jest](https://jestjs.io/) and depending on the environment configuration will run the specific functionality either directly in the node execution environment, or in a browser environment using Selenium. This makes for slightly higher complexity for test writing -- types must be serialized and unserialized between the test runner and the test environment, but in return a single test definition works for all targeted environments.

The browser tests use the compiled version of the SDK, so make sure you build a compiled version before pushing your code. Configuration is managed via environment variables. Before testing, copy the `.env.example` file to `.env` in the root of the project (`.env` is in .gitignore). Add the configuration for your tests -- the registration token, a test realm and test application. Once the env file is set up, you can being testing.

### Local Testing

Tests can be run locally with `npm test`.

You can target a specific test file by passing the name of the file as a parameter: `npm test -- storage`.

The test variant run is controlled by the run time environment. You can manage this either with environment variables or with a `.env` file. Create a copy of this file based on the `env.example` file included.

You must provide a valid registration token for the test environment. If you are targeting something other than the default Tozny API url, you must specify the API_URL as well. To test identity functionality, a valid realm name and app name must also be included

```sh
API_URL=http://platform.local.tozny.com:8000
CLIENT_REGISTRATION_TOKEN=449fa69b9eedc5689d24929345d8cc6e32fdfdc042bfa762a1e0319cc4e7916
ID_REALM_NAME=IntegrationTest-0000000
ID_APP_NAME=integration-test
```

The test environment is also controlled with environment variables

```sh
# The basic environment: 'node' or 'browser'
TEST_TARGET=node
# When TEST_TARGET is 'browser', this determines which selenium driver is used
# 'safari', 'firefox', 'chrome'
TEST_BROWSER=safari
# The general timeout used for most tests in milliseconds
TEST_IDLE_TIMEOUT_MILLISECONDS=100000
# Remote Selenium Setup
TEST_BROWSER_PLATFORM=Windows\ 10
TEST_BROWSER_VERSION=70
TEST_REMOTE_USERNAME=example
TEST_REMOTE_PASSWORD=example

# The selenium set up to use: 'local' or 'remote'
TEST_ENVIRONMENT=remote
# The git branch being tested, used to load the correct browser page
TEST_REMOTE_BRANCH=feature/some-branch
# When true, local selenium will load the minified script instead of the dev version
# This is useful if an issue with minification comes up.
TEST_LOCAL_USE_PROD=false
# When true, local selenium will load the remote branch URL instead of the local copy
# This is useful when local tests pass, but remote tests fail.
TEST_LOCAL_USE_CDN=false
```

### Remote Testing from Local

You can run tests with SauceLabs from you local machine. To do this you will need Sauce Labs credentials, placing them in your `.env` file.

```sh
# The OS in Sauce Labs (macOS 10.14, Windows 10)
TEST_BROWSER_PLATFORM='macOS 10.14'
# The specific browser version to use
TEST_BROWSER_VERSION='latest'
# Sauce Labs username
TEST_REMOTE_USERNAME=tozny
# Sauce Labs API Key
TEST_REMOTE_PASSWORD=000000000000-0000-0000-0000-00000000
# Sauce labs must load a publicly accessible web page.
# This tells it which branch in github has the compiled version for used in testing.
TEST_REMOTE_BRANCH=master
```

### Testing with TravisCI

When a new branch is pushed or PR opened, Travis runs the full suite of tests against several node environemnts and connects with Sauce Labs to run browser tests. The Sauce Labs configuration is managed with encrypted values injected from the Travis project configuration. They must be updated in the Travis project settings if any of the configuration changes.
