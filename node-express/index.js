const WebSocket = require('ws')
const JSONRPCVersion = '2.0-x'

class JSONRPCMiddleware {
  constructor (namespacedmethods, ...middleware) {
    this.namespacedmethods = namespacedmethods
    this.middleware = middleware
    this.ws = new WebSocket.Server({ noServer: true })
    return {
      middleware: this.serve.bind(this),
      upgrader: this.upgrade.bind(this),
    }
  }

  _methodLookup (method) {
    const steps = method.split('.')
    let container = this.namespacedmethods
    for (const s of steps.slice(0, -1)) {
      container = container[s]
      if (!container) {
        throw new RPCError(-32601, 'method not found on server')
      }
    }
    const fn = container[steps.pop()]
    if (!fn) {
      throw new RPCError(-32601, 'method not found on server')
    } else {
      return fn.bind(container)
    }
  }

  async _readContext (req) {
    const context = {}
    for (const m of this.middleware) {
      await m(context, req)
    }
    return context
  }

  async _handle (context, { method: methodname, params, id }) {
    try {
      const method = this._methodLookup(methodname)
      const result = method(context, ...params)
      return {
        jsonrpc: JSONRPCVersion,
        result,
        id
      }
    } catch (error) {
      return {
        jsonrpc: JSONRPCVersion,
        error: toJSONRPCError(error),
        id
      }
    }
  }

  serve (req, res) {
    let requests = req.body
    if (!Array.isArray(requests)) {
      requests = [requests]
    }
    const results = []
    this._readContext(req).then(context => {
      return Promise.all(requests.map(async request => {
        const result = await this._handle(context, request)
        if (result) {
          results.push(result)
        }
      }))
    }).then(() => {
      if (results.length === 1) {
        res.json(results[0])
      } else {
        res.json(results)
      }
    })
  }

  upgrade(request, socket, head) {
    this._readContext(request).then(context => {
      this.ws.handleUpgrade(request, socket, head, ws => {
        ws.on('message', (d) => {
          const request = JSON.parse(d)
          this._handle(context, request).then(result => {
            ws.send(JSON.stringify(result))
          })
        })
      })
    })
  }
}

function toJSONRPCError (error) {
  if (error.isRPCError) {
    return {
      code: error.code,
      message: error.message,
      data: error.data
    }
  } else {
    return {
      code: -32000,
      message: 'Unhandled exception occured in server: ' + error.message
    }
  }
}

class RPCError extends Error {
  constructor (code, message, data) {
    super(`[${code}] ${message}`)
    this.name = 'RPCError'
    this.code = code
    this.message = message
    this.data = data
    this.isRPCError = true
  }
}

module.exports = {
  JSONRPCMiddleware,
  RPCError
}
