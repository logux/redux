var createStore = require('redux').createStore
var Client = require('logux-client/client')

/**
 * Creates Logux client and connect it to Redux store.
 *
 * @param {function} reducer Redux reducer.
 * @param {any} preloadedState Initial Redux state.
 * @param {function} enhancer Redux middleware.
 * @param {object} config Logux Client config.
 *
 * @return {object} Redux store with Logux hacks.
 */
function createLoguxStore (reducer, preloadedState, enhancer, config) {
  var store = createStore(reducer, preloadedState, enhancer)
  store.client = new Client(config)

  store.add = function (action, meta) {
    return store.client.log.add(action, meta)
  }

  var originDispatch = store.dispatch
  store.dispatch = function dispatch (action) {
    store.add(action, { tab: store.client.id })
  }
  store.client.log.on('add', function (action) {
    originDispatch(action)
  })

  return store
}

module.exports = createLoguxStore
