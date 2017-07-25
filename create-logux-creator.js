var CrossTabClient = require('logux-client/cross-tab-client')
var createStore = require('redux').createStore

/**
 * Creates Logux client and connect it to Redux createStore function.
 *
 * @param {object} config Logux Client config.
 *
 * @return {function} Redux createStore function with Logux hacks.
 */
function createLoguxCreator (config) {
  var client = new CrossTabClient(config)

  /**
   * Creates Redux store and connect Logux Client to it.
   *
   * @param {function} reducer Redux reducer.
   * @param {any} preloadedState Initial Redux state.
   * @param {function} enhancer Redux middleware.
   *
   * @return {object} Redux store with Logux hacks.
   */
  return function createLoguxStore (reducer, preloadedState, enhancer) {
    var store = createStore(reducer, preloadedState, enhancer)
    store.client = client

    store.add = function (action, meta) {
      return store.client.log.add(action, meta)
    }

    var originDispatch = store.dispatch
    store.dispatch = function dispatch (action) {
      var id = store.client.id
      store.add(action, { tab: id, reasons: ['tab' + id], dispatch: true })
      originDispatch(action)
    }
    store.client.log.on('add', function (action, meta) {
      if (!meta.dispatch) {
        originDispatch(action)
      }
    })

    return store
  }
}

module.exports = createLoguxCreator
