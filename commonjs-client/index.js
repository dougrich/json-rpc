class RPCError extends Error {
  constructor ({ code, message, data }) {
    super(`[${code}] ${message}`)
    this.name = 'RPCError'
    this.data = data
    this.isRPCError = true
    Error.captureStackTrace(this, RPCError)
  }
}

const HeaderContentType = 'Content-Type'

const DefaultFetch = (typeof window !== 'undefined') ? window.fetch : global.fetch
const DefaultWebSocket = (typeof window !== 'undefined') ? window.WebSocket : global.WebSocket
const DefaultContentType = 'application/json'
const DefaultMethod = 'POST'
const JSONRPCVersion = '2.0-x'

class BaseJSONRPCClient {
  constructor () {
    this.id = 0
    this.pending = {}
    this.debounceCalls = []
  }

  _handle (response) {
    if (!Array.isArray(response)) {
      response = [response]
    }

    for (const each of response) {
      if (each.jsonrpc !== JSONRPCVersion) {
        throw new Error('RPC Error: missing jsonrpc value in JSON response')
      }
    }
    // this is broken apart to ensure that we don't partially resolve
    for (const each of response) {
      if (this.pending[each.id]) {
        this.pending[each.id](each)
        delete this.pending[each.id]
      }
    }
  }

  _resolve (ids, err) {
    for (const id of ids) {
      if (this.pending[id]) {
        this.pending[id]({ error: err })
        delete this.pending[id]
      }
    }
  }

  _newPending (id) {
    return new Promise((resolve, reject) => {
      this.pending[id] = ({ result, error }) => {
        if (error != null) {
          if (error.code) {
            reject(new RPCError(error))
          } else {
            reject(error)
          }
        } else {
          resolve(result)
        }
      }
    })
  }

  api (namespace) {
    if (namespace) {
      namespace += '.'
    }
    return new Proxy(Object.freeze({}), {
      get: (_, method) => {
        const that = this
        return function () {
          const payload = {
            jsonrpc: JSONRPCVersion,
            method: namespace + method,
            params: Array.prototype.slice.apply(arguments),
            id: that.id++
          }
          return that._enqueue(payload)
        }
      }
    })
  }
}

class JSONRPCClient extends BaseJSONRPCClient {
  constructor (
    endpoint,
    {
      fetch,
      fetchOptions,
      debounceWindow
    } = {}
  ) {
    super()
    this.endpoint = endpoint
    this.fetch = fetch || DefaultFetch
    this.fetchOptions = fetchOptions || {}
    this.debounceWindow = debounceWindow || 0
  }

  _request (payload, ids) {
    return this.fetch(this.endpoint, {
      method: DefaultMethod,
      ...this.fetchOptions,
      headers: {
        [HeaderContentType]: DefaultContentType,
        ...(this.fetchOptions.headers || {})
      },
      body: JSON.stringify(payload)
    }).then(res => res.json()).then(response => {
      this._handle(response)
      return undefined
    }).catch(err => {
      return err
    }).then(err => {
      this._resolve(ids, err)
    })
  }

  _enqueue (payload) {
    const p = this._newPending(payload.id)

    if (this.debounceWindow) {
      this.debounceCalls.push(payload)
      if (this.debounceTimeout == null) {
        this.debounceTimeout = setTimeout(() => {
          const calls = this.debounceCalls
          this.debounceCalls = []
          this._request(calls, calls.map(x => x.id))
        }, this.debounceWindow)
      }
    } else {
      this._request(payload, [payload.id])
    }

    return p
  }
}

class PersistentJSONRPCClient extends BaseJSONRPCClient {
  constructor (
    endpoint,
    {
      websocket
    } = {}
  ) {
    super()
    this.endpoint = endpoint
    this.connection = null
    this.WS = websocket || DefaultWebSocket
    this.connecting = null
  }

  _connect () {
    if (!this.connecting) {
      this.connecting = new Promise((resolve, reject) => {
        this.connection = new this.WS(this.endpoint)
        this.connection.addEventListener('open', e => {
          resolve()
        })
        this.connection.addEventListener('message', e => {
          let data = null
          try {
            data = JSON.parse(e.data)
          } catch (err) {
            // error occured parsing json
            console.error('unknown error occured - panic')
            this.close()
          }
          this._handle(data)
        })
        this.connection.addEventListener('error', e => {
          console.error('connection error')
          this.close()
        })
        this.connection.addEventListener('close', e => {
          // close
          this.close()
        })
      })
    }
    return this.connecting
  }

  async _enqueue (payload) {
    await this._connect()
    const p = this._newPending(payload.id)
    this.connection.send(JSON.stringify(payload))
    return p
  }

  close () {
    if (this.connection) {
      this.connection.close(1000)
    }
    this.connection = null
    this.connecting = null
  }
}

module.exports = {
  PersistentJSONRPCClient,
  JSONRPCClient,
  HeaderContentType,
  DefaultContentType,
  DefaultMethod,
  JSONRPCVersion
}
