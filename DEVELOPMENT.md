# Testing

The tests for this SDK must be run in a browser. Otherwise, the browser crypto API will not be able to generate cryptographically secure pseudo-random numbers and seed the crypto methods. Running the tests in Jest will fail, as Jest uses JSDOM and does not have the crypto API.

Currently, Tozny runs tests using Karma and Sauce Labs.

To run tests on your machine, you need a Sauce Labs Account. Then you need to export three environment variables:

export SAUCE_USERNAME=tozny
export SAUCE_ACCESS_KEY=<access_key>
export REGISTRATION_TOKEN=<from_tozny_dashboard> 

You can then use the npm run test script to run the karma tests.

The Sauce Labs account is a Tozny ops account with a shared email, username, and password.  
