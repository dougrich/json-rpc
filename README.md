# JSON RPC implementations

Specification: https://www.jsonrpc.org/specification

It is extended as below.

| Generally JSON RPC should only be used in authenticated scenarios for app utility. It doesn't really mesh well with existing cache implementations.

## Conventions

Keywords are from https://www.ietf.org/rfc/rfc2119.txt and are in capitals.

JSON-RPC does not exist in a vacuum and has not been updated to reflect changes since it was last updated in 2013. Additional considerations need to be made.

The __Environment__ is defined as being either a websocket connection or an http request/response. These are abbreviated as a WS Environment and a HTTP Environment.

The __Context__ is defined as being the information related to a method. This MUST be exposed to methods on the server as a map containing key value pairs, where the key is a string constant. The exact exposure of this context is language dependent. It MUST NOT be accessible from the client - it will contain secure information.

## Protocol Methods

JSON RPC states that a method beginning with `rpc.` is used for internal RPC methods and MUST NOT be used for anything else.

This specification includes additional protocol methods. These have a method name beginning with `x-rpc.` and MUST NOT be used for anything else.

## Authentication

There are two broad patterns for authentication in use: headers and cookies.

Cookie authentication can be used from both the WS Environment and the HTTP Environment without difficulties.

Header authentication is provided using the `Authorization` header when in a HTTP Environment; this does not change.