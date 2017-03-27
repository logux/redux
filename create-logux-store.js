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
  return store
}

module.exports = createLoguxStore
