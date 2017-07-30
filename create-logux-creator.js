var CrossTabClient = require('logux-client/cross-tab-client')
var isFirstOlder = require('logux-core/is-first-older')
var createStore = require('redux').createStore

function warnBadUndo (id) {
  var json = JSON.stringify(id)
  console.warn(
    'Logux can not undo action ' + json + ', because it did not ' +
    'find this action in the log. Maybe action was cleaned.'
  )
}

/**
 * Creates Logux client and connect it to Redux createStore function.
 *
 * @param {object} config Logux Client config.
 * @param {string} options.url Server URL.
 * @param {string} options.subprotocol Client subprotocol version
 *                                     in SemVer format.
 * @param {number|string|false} options.userId User ID. Pass `false` if no user.
 * @param {any} [options.credentials] Client credentials for authentication.
 * @param {string} [options.prefix="logux"] Prefix for `IndexedDB` database
 *                                          to run multiple Logux instances
 *                                          in the same browser.
 * @param {number} [options.timeout=20000] Timeout in milliseconds
 *                                         to break connection.
 * @param {number} [options.ping=10000] Milliseconds since last message to test
 *                                      connection by sending ping.
 * @param {Store} [options.store] Store to save log data. `IndexedStore`
 *                                by default (if available)
 * @param {number} [options.minDelay=1000] Minimum delay between reconnections.
 * @param {number} [options.maxDelay=5000] Maximum delay between reconnections.
 * @param {number} [options.attempts=Infinity] Maximum reconnection attempts.
 * @param {bool} [options.allowDangerousProtocol=false] Do not show warning
 *                                                      when using 'ws://'
 *                                                      in production.
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

    function replay (actionId) {
      var until = actionId.join('\t')

      var ignore = { }
      var actions = []
      var collecting = true

      client.log.each(function (action, meta) {
        var id = meta.id.join('\t')

        if (collecting) {
          if (action.type === 'logux/undo') {
            ignore[action.id.join('\t')] = true
            return true
          }

          if (!ignore[id]) actions.push([action, id])
          if (id === until) collecting = false

          return true
        } else {
          var state = store.history[id]

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

    client.on('add', function (action, meta) {
      if (meta.dispatch) return

      if (action.type === 'logux/undo') {
        client.log.has(action.id).then(function (exist) {
          if (exist) {
            delete store.history[action.id.join('\t')]
            replay(action.id)
          } else {
            warnBadUndo(action.id)
          }
        })
      } else if (!meta.added) {
        prevMeta = meta
        originDispatch(action)
      } else if (isFirstOlder(prevMeta, meta)) {
        prevMeta = meta
        originDispatch(action)
        store.history[meta.id.join('\t')] = store.getState()
      } else {
        replay(meta.id)
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
