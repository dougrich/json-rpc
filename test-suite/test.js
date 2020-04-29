const fetch = require('node-fetch')
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
chai.use(chaiAsPromised)
const { expect } = chai
const { JSONRPCClient } = require('../commonjs-client')

const endpoint = process.env.ENDPOINT

describe('http', () => {
  describe('no debounce', () => {
    describe('test.Sum', () => {
      const api = new JSONRPCClient('http://' + endpoint, { fetch }).api('test')
      it('OK', async () => {
        await expect(api.Sum(1, 4, 5)).to.eventually.eql(10)
      })
      it('String parameter error', async () => {
        await expect(api.Sum(1, 4, '5')).to.eventually.rejectedWith('[-32602] parameters should be (number (int), number (int), ...number (int))')
      })
      it('Parameter count', async () => {
        await expect(api.Sum(1)).to.eventually.rejectedWith('[-32602] parameters should be (number (int), number (int), ...number (int))')
      })
    })
    it('test.Missing -> returns correct error', async () => {
      const api = new JSONRPCClient('http://' + endpoint, { fetch }).api('test')
      await expect(api.Missing(1)).to.eventually.rejectedWith('[-32601] method not found on server')
    })
    it('test.SecureSum -> rejects unauthenticated', async () => {
      const api = new JSONRPCClient('http://' + endpoint, { fetch }).api('test')
      await expect(api.SecureSum(1, 2)).to.eventually.rejectedWith('[1003] current user is not authorized')
    })
    it('test.SecureSum -> accepts authenticated', async () => {
      const api = new JSONRPCClient('http://' + endpoint, { fetch, fetchOptions: { headers: { Authorization: 'Basic 1234:1234' } } }).api('test')
      await expect(api.SecureSum(1, 4, 5)).to.eventually.eql(10)
    })
  })

  it('with debounce', () => {
    const api = new JSONRPCClient('http://' + endpoint, { fetch, debounceWindow: 10 }).api('test')

    return Promise.all([
      expect(api.Sum(1, 4, 5)).to.eventually.eql(10),
      expect(api.Sum(1, 4, '5')).to.eventually.rejectedWith('[-32602] parameters should be (number (int), number (int), ...number (int))'),
      expect(api.Sum(1)).to.eventually.rejectedWith('[-32602] parameters should be (number (int), number (int), ...number (int))'),
      expect(api.Missing(1)).to.eventually.rejectedWith('[-32601] method not found on server')
    ])
  })
})
