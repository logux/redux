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
    store.history = { }

    store.add = function (action, meta) {
      return store.client.log.add(action, meta)
    }

    var lastId = 0
    var originDispatch = store.dispatch
    store.dispatch = function dispatch (action) {
      lastId += 1
      var id = store.client.id
      var meta = { tab: id, reasons: ['tab' + id], dispatch: lastId }
      store.add(action, meta)

      originDispatch(action)
      store.history[meta.dispatch] = store.getState()
    }

    store.client.log.on('add', function (action, meta) {
      if (meta.dispatch) return
      originDispatch(action)

      if (!meta.added) return
      store.history[meta.id.join('\t')] = store.getState()
    })

    store.client.log.on('clean', function (action, meta) {
      if (!meta.added) return
      if (meta.dispatch) {
        delete store.history[meta.dispatch]
      } else {
        delete store.history[meta.id.join('\t')]
      }
    })

    return store
  }
}

module.exports = createLoguxCreator
