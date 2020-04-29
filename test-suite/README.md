# Test Suite

The test suite verifies implementation of the X-JSON-RPC format defined in this repo.

The server MUST implement two methods:

`test.Sum` which:
- takes N number parameters
  - if it sees a non-number parameter, returns an error; code 1001, message 'arguments[2] should be a number'
  - if it sees 0 or 1 parameters, returns an error; code 1002, message 'too few arguments, need 2 or more'
- sums all the values

`test.SecureSum` which:
- if the user is unauthenticated, returns an error
- otherwise behaves like Sum