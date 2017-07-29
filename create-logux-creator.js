var CrossTabClient = require('logux-client/cross-tab-client')
var isFirstOlder = require('logux-core/is-first-older')
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
    var store = createStore(function (state, action) {
      if (action.type === 'logux/state') {
        return action.state
      } else {
        return reducer(state, action)
      }
    }, preloadedState, enhancer)

    store.client = client
    store.history = { }

    store.add = function (action, meta) {
      return store.client.log.add(action, meta)
    }

    var prevMeta

    var originDispatch = store.dispatch
    store.dispatch = function dispatch (action) {
      var meta = {
        id: client.log.generateId(),
        tab: store.client.id,
        reasons: ['tab' + store.client.id],
        dispatch: true
      }
      store.add(action, meta)

      prevMeta = meta
      originDispatch(action)
      store.history[meta.id.join('\t')] = store.getState()
    }

    client.on('add', function (action, meta) {
      if (meta.dispatch) return

      if (!meta.added) {
        prevMeta = meta
        originDispatch(action)
      } else if (isFirstOlder(prevMeta, meta)) {
        prevMeta = meta
        originDispatch(action)
        store.history[meta.id.join('\t')] = store.getState()
      } else {
        var actions = []

        client.log.each(function (action2, meta2) {
          if (meta.added === meta2.added || isFirstOlder(meta, meta2)) {
            actions.push([action2, meta2.id.join('\t')])
            return true
          } else {
            var state = store.history[meta2.id.join('\t')]

            state = actions.reduceRight(function (prev, i) {
              var changed = reducer(prev, i[0])
              store.history[i[1]] = changed
              return changed
            }, state)

            originDispatch({ type: 'logux/state', state: state })
            return false
          }
        })
      }
    })

    client.on('clean', function (action, meta) {
      if (!meta.added) return
      delete store.history[meta.id.join('\t')]
    })

    return store
  }
}

module.exports = createLoguxCreator
