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
const DefaultContentType = 'application/json'
const DefaultMethod = 'POST'
const JSONRPCVersion = '2.0-x'

class JSONRPCClient {
  constructor (
    endpoint,
    {
      fetch,
      fetchOptions,
      debounceWindow
    } = {}
  ) {
    this.endpoint = endpoint
    this.fetch = fetch || DefaultFetch
    this.fetchOptions = fetchOptions || {}
    this.debounceWindow = debounceWindow || 0
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
    const p = new Promise((resolve, reject) => {
      this.pending[payload.id] = ({ result, error }) => {
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

module.exports = {
  JSONRPCClient,
  HeaderContentType,
  DefaultContentType,
  DefaultMethod,
  JSONRPCVersion
}
