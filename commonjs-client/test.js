const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const sinonChai = require('sinon-chai')
const dirtyChai = require('dirty-chai')
chai.use(chaiAsPromised)
chai.use(sinonChai)
chai.use(dirtyChai)
const { expect } = chai
const {
  JSONRPCClient,
  PersistentJSONRPCClient,
  HeaderContentType,
  DefaultContentType,
  DefaultMethod,
  JSONRPCVersion
} = require('./')
const sinon = require('sinon')

const testresult = 10
const testendpoint = 'http://test.com'

function createFetch (jsonresult = { jsonrpc: JSONRPCVersion, result: testresult, error: null }) {
  return sinon.fake((endpoint, fetchoptions) => {
    const body = JSON.parse(fetchoptions.body)
    let result = null
    if (Array.isArray(body)) {
      result = body.map(({ id }) => ({
        id,
        ...jsonresult
      }))
    } else {
      result = {
        id: body.id,
        ...jsonresult
      }
    }

    return Promise.resolve({ json: () => Promise.resolve(result) })
  })
}

describe('JSONRPCClient', () => {
  it('fetches single request correctly', async () => {
    const fetch = createFetch()
    const client = new JSONRPCClient(
      testendpoint,
      { fetch }
    )
    const result = await client.api('test.unit').add(1, 2, 3, 4)
    expect(result).to.eql(testresult)
    expect(fetch).to.have.been.calledWith(testendpoint, {
      method: DefaultMethod,
      headers: {
        [HeaderContentType]: DefaultContentType
      },
      body: JSON.stringify({
        jsonrpc: JSONRPCVersion,
        method: 'test.unit.add',
        params: [1, 2, 3, 4],
        id: 0
      })
    })
  })
  it('includes custom headers', async () => {
    const fetch = createFetch()
    const client = new JSONRPCClient(
      testendpoint,
      {
        fetch,
        fetchOptions: {
          headers: {
            Authorization: 'Bearer 1234'
          }
        }
      }
    )
    const result = await client.api('test.unit').add(1, 2, 3, 4)
    expect(result).to.eql(testresult)
    expect(fetch).to.have.been.calledWith(testendpoint, {
      method: DefaultMethod,
      headers: {
        [HeaderContentType]: DefaultContentType,
        Authorization: 'Bearer 1234'
      },
      body: JSON.stringify({
        jsonrpc: JSONRPCVersion,
        method: 'test.unit.add',
        params: [1, 2, 3, 4],
        id: 0
      })
    })
  })
  it("doesn't debounce by default", async () => {
    const fetch = createFetch()
    const client = new JSONRPCClient(
      testendpoint,
      { fetch }
    )
    const [result] = await Promise.all([
      client.api('test.unit').add(1, 2, 3, 4),
      client.api('test.unit').add(4, 3, 2, 1)
    ])
    expect(result).to.eql(testresult)
    expect(fetch).to.have.been.calledWith(testendpoint, {
      method: DefaultMethod,
      headers: {
        [HeaderContentType]: DefaultContentType
      },
      body: JSON.stringify({
        jsonrpc: JSONRPCVersion,
        method: 'test.unit.add',
        params: [1, 2, 3, 4],
        id: 0
      })
    })
    expect(fetch).to.have.been.calledWith(testendpoint, {
      method: DefaultMethod,
      headers: {
        [HeaderContentType]: DefaultContentType
      },
      body: JSON.stringify({
        jsonrpc: JSONRPCVersion,
        method: 'test.unit.add',
        params: [4, 3, 2, 1],
        id: 1
      })
    })
    expect(fetch).to.have.been.calledTwice()
  })
  it('can debounce', async () => {
    const fetch = createFetch()
    const client = new JSONRPCClient(
      testendpoint,
      { fetch, debounceWindow: 10 }
    )
    const [result] = await Promise.all([
      client.api('test.unit').add(1, 2, 3, 4),
      client.api('test.unit').add(4, 3, 2, 1)
    ])
    expect(result).to.eql(testresult)
    expect(fetch).to.have.been.calledWith(testendpoint, {
      method: DefaultMethod,
      headers: {
        [HeaderContentType]: DefaultContentType
      },
      body: JSON.stringify([{
        jsonrpc: JSONRPCVersion,
        method: 'test.unit.add',
        params: [1, 2, 3, 4],
        id: 0
      }, {
        jsonrpc: JSONRPCVersion,
        method: 'test.unit.add',
        params: [4, 3, 2, 1],
        id: 1
      }])
    })
    expect(fetch).to.have.been.calledOnce()
  })

  it('closes ackd messages with no response', async () => {
    const fetch = sinon.fake(() => {
      const result = []
      return Promise.resolve({ json: () => Promise.resolve(result) })
    })
    const client = new JSONRPCClient(
      testendpoint,
      { fetch }
    )
    const result = await client.api('test.unit').add(1, 2, 3, 4)
    expect(result).to.be.undefined()
    expect(fetch).to.have.been.calledWith(testendpoint, {
      method: DefaultMethod,
      headers: {
        [HeaderContentType]: DefaultContentType
      },
      body: JSON.stringify({
        jsonrpc: JSONRPCVersion,
        method: 'test.unit.add',
        params: [1, 2, 3, 4],
        id: 0
      })
    })
  })

  describe('errors', () => {
    [
      [
        'bad jsonrpc value',
        {
          result: null,
          error: null,
          id: null
        },
        'RPC Error: missing jsonrpc value in JSON response'
      ],
      [
        'user level error',
        {
          jsonrpc: JSONRPCVersion,
          result: null,
          error: { code: 15, message: 'Test error' }
        },
        '[15] Test error'
      ]
    ].forEach(([name, result, expectedErrorMsg]) => {
      it(name, async () => {
        const fetch = createFetch(result)
        const client = new JSONRPCClient(
          testendpoint,
          { fetch }
        )
        await expect(client.api('test.unit').add(1, 2, 3, 4)).to.eventually.rejectedWith(expectedErrorMsg)
      })
    })
  })
})

describe('PersistentJSONRPCClient', () => {
  function createFakeWebsocket () {
    const state = {
      endpoint: '',
      messages: [],
      events: {}
    }

    return [state, class {
      constructor (endpoint) {
        state.endpoint = endpoint
      }

      send (message) {
        state.messages.push(JSON.parse(message))
      }

      addEventListener (type, handler) {
        state.events[type] = handler
      }
    }]
  }

  it('creates a new websocket, sends request, understands response', async () => {
    const [wsstate, ws] = createFakeWebsocket()
    const client = new PersistentJSONRPCClient('ws://example.test.com', { websocket: ws })
    const result = client.api('test.unit').add(1, 2, 3, 4)
    expect(wsstate.endpoint).to.eql('ws://example.test.com')
    expect(wsstate.events.message).to.exist()
    setTimeout(function () {
      wsstate.events.open()
      setTimeout(function () {
        wsstate.events.message({ data: JSON.stringify({ id: 0, result: 5, jsonrpc: JSONRPCVersion }) })
      })
    })
    await expect(result).to.eventually.equal(5)
    expect(wsstate.messages).to.eql([{
      jsonrpc: JSONRPCVersion,
      method: 'test.unit.add',
      params: [1, 2, 3, 4],
      id: 0
    }])
  })
})
