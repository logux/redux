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
 * @param {string} config.url Server URL.
 * @param {string} config.subprotocol Client subprotocol version
 *                                    in SemVer format.
 * @param {number|string|false} config.userId User ID. Pass `false` if no user.
 * @param {any} [config.credentials] Client credentials for authentication.
 * @param {string} [config.prefix="logux"] Prefix for `IndexedDB` database
 *                                         to run multiple Logux instances
 *                                         in the same browser.
 * @param {number} [config.timeout=20000] Timeout in milliseconds
 *                                        to break connection.
 * @param {number} [config.ping=10000] Milliseconds since last message to test
 *                                     connection by sending ping.
 * @param {Store} [config.store] Store to save log data. `IndexedStore`
 *                               by default (if available)
 * @param {number} [config.minDelay=1000] Minimum delay between reconnections.
 * @param {number} [config.maxDelay=5000] Maximum delay between reconnections.
 * @param {number} [config.attempts=Infinity] Maximum reconnection attempts.
 * @param {bool} [config.allowDangerousProtocol=false] Do not show warning
 *                                                     when using 'ws://'
 *                                                     in production.
 * @param {number} [config.saveStateEvery=50] How often save state to history.
 *
 * @return {function} Redux createStore function with Logux hacks.
 */
function createLoguxCreator (config) {
  if (!config) config = { }
  var saveStateEvery = config.saveStateEvery || 50
  delete config.saveStateEvery
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
    store.log = client.log
    var history = { }

    store.add = function (action, meta) {
      return store.client.log.add(action, meta)
    }

    var actionCount = 0
    function saveHistory (meta) {
      actionCount += 1
      if (saveStateEvery === 1 || actionCount % saveStateEvery === 1) {
        history[meta.id.join('\t')] = store.getState()
      }
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
      saveHistory(meta)
    }

    function replay (actionId) {
      var until = actionId.join('\t')

      var ignore = { }
      var actions = []
      var collecting = true

      client.log.each(function (action, meta) {
        var id = meta.id.join('\t')

        if (collecting || !history[id]) {
          if (action.type === 'logux/undo') {
            ignore[action.id.join('\t')] = true
            return true
          }

          if (!ignore[id]) actions.push([action, id])
          if (id === until) collecting = false

          return true
        } else {
          var state = history[id]

          state = actions.reduceRight(function (prev, i) {
            var changed = reducer(prev, i[0])
            if (history[i[1]]) history[i[1]] = changed
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
            delete history[action.id.join('\t')]
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
        saveHistory(meta)
      } else {
        replay(meta.id)
      }
    })

    client.on('clean', function (action, meta) {
      if (!meta.added) return
      delete history[meta.id.join('\t')]
    })

    return store
  }
}

module.exports = createLoguxCreator
