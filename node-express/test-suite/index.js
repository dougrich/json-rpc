const { JSONRPCMiddleware, RPCError } = require('../')
const express = require('express')
const bodyParser = require('body-parser')
const http = require('http')

const methods = {
  Sum: (context, ...numbers) => {
    const parametersError = new RPCError(-32602, 'parameters should be (number (int), number (int), ...number (int))')

    if (numbers.length < 2) {
      throw parametersError
    }
    for (const i in numbers) {
      if (typeof numbers[i] !== 'number' || !Number.isInteger(numbers[i])) {
        throw parametersError
      }
    }
    return numbers.reduce((p, v) => p + v, 0)
  },
  SecureSum: function (context, ...numbers) {
    if (!context.isAuthenticated) {
      throw new RPCError(1003, 'current user is not authorized')
    }
    return this.Sum(context, ...numbers)
  }
}

const TestAuth = async (context, req) => {
  if (req.headers.authorization) {
    context.isAuthenticated = true
  }
}

const app = express()
const { middleware, upgrader } = new JSONRPCMiddleware({
  test: methods
}, TestAuth)
app.use(bodyParser.json())
app.use(middleware)
const server = http.createServer(app)
server.on('upgrade', upgrader)
server.listen(8080)
