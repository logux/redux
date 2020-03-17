let { createNanoEvents } = require('nanoevents')
let { CrossTabClient } = require('@logux/client/cross-tab-client')
let { isFirstOlder } = require('@logux/core/is-first-older')
let { createStore } = require('redux')

function hackReducer (reducer) {
  return (state, action) => {
    if (action.type === 'logux/state') {
      return action.state
    } else {
      return reducer(state, action)
    }
  }
}

function createLoguxCreator (config = { }) {
  let checkEvery = config.checkEvery || 25
  delete config.checkEvery
  let reasonlessHistory = config.reasonlessHistory || 1000
  delete config.reasonlessHistory
  let saveStateEvery = config.saveStateEvery || 50
  delete config.saveStateEvery
  let onMissedHistory = config.onMissedHistory
  delete config.onMissedHistory

  let client = new CrossTabClient(config)
  let log = client.log

  return function createLoguxStore (reducer, preloadedState, enhancer) {
    let store = createStore(hackReducer(reducer), preloadedState, enhancer)

    let emitter = createNanoEvents()

    store.client = client
    store.log = log
    let historyCleaned = false
    let stateHistory = { }

    let processing = { }

    let actionCount = 0
    function saveHistory (meta) {
      actionCount += 1
      if (saveStateEvery === 1 || actionCount % saveStateEvery === 1) {
        stateHistory[meta.id] = store.getState()
      }
    }

    let originReplace = store.replaceReducer
    store.replaceReducer = newReducer => {
      reducer = newReducer
      return originReplace(hackReducer(newReducer))
    }

    store.on = emitter.on.bind(emitter)

    let init
    store.initialize = new Promise(resolve => {
      init = resolve
    })

    let prevMeta
    let originDispatch = store.dispatch
    store.dispatch = action => {
      let meta = {
        id: log.generateId(),
        tab: store.client.tabId,
        reasons: ['timeTravelTab' + store.client.tabId],
        dispatch: true
      }
      log.add(action, meta)

      prevMeta = meta
      let prevState = store.getState()
      originDispatch(action)
      emitter.emit('change', store.getState(), prevState, action, meta)
      saveHistory(meta)
    }

    store.dispatch.local = (action, meta = { }) => {
      meta.tab = client.tabId
      if (meta.reasons || meta.keepLast) meta.noAutoReason = true
      return log.add(action, meta)
    }

    store.dispatch.crossTab = (action, meta = { }) => {
      if (meta.reasons || meta.keepLast) meta.noAutoReason = true
      return log.add(action, meta)
    }

    store.dispatch.sync = (action, meta = { }) => {
      if (meta.reasons || meta.keepLast) meta.noAutoReason = true

      meta.sync = true

      if (typeof meta.id === 'undefined') {
        meta.id = log.generateId()
      }

      return new Promise((resolve, reject) => {
        processing[meta.id] = [resolve, reject]
        log.add(action, meta)
      })
    }

    function replaceState (state, actions, pushHistory) {
      let last = actions[actions.length - 1][1]
      let newState = actions.reduceRight((prev, [action, id]) => {
        let changed = reducer(prev, action)
        if (pushHistory && id === last) {
          stateHistory[pushHistory] = changed
        } else if (stateHistory[id]) {
          stateHistory[id] = changed
        }
        return changed
      }, state)
      originDispatch({ type: 'logux/state', state: newState })
      return newState
    }

    let replaying
    function replay (actionId) {
      let ignore = { }
      let actions = []
      let replayed = false
      let newAction
      let collecting = true

      replaying = new Promise(resolve => {
        log.each((action, meta) => {
          if (meta.tab && meta.tab !== client.tabId) return true

          if (collecting || !stateHistory[meta.id]) {
            if (action.type === 'logux/undo') {
              ignore[action.id] = true
              return true
            } else if (action.type.startsWith('logux/')) {
              return true
            }

            if (!ignore[meta.id]) actions.push([action, meta.id])
            if (meta.id === actionId) {
              newAction = action
              collecting = false
            }

            return true
          } else {
            replayed = true
            replaceState(stateHistory[meta.id], actions)
            return false
          }
        }).then(() => {
          if (!replayed) {
            if (historyCleaned) {
              if (onMissedHistory) {
                onMissedHistory(newAction)
              }
              for (let i = actions.length - 1; i >= 0; i--) {
                let id = actions[i][1]
                if (stateHistory[id]) {
                  replayed = true
                  replaceState(
                    stateHistory[id],
                    actions.slice(0, i).concat([[newAction, actionId]]),
                    id
                  )
                  break
                }
              }
            }

            if (!replayed) {
              replaceState(preloadedState, actions.concat([
                [{ type: '@@redux/INIT' }]
              ]))
            }
          }

          replaying = false
          resolve()
        })
      })

      return replaying
    }

    log.on('preadd', (action, meta) => {
      let type = action.type
      let isLogux = type.startsWith('logux/')
      if (type === 'logux/undo') {
        meta.reasons.push('reasonsLoading')
      }
      if (!isLogux && !isFirstOlder(prevMeta, meta)) {
        meta.reasons.push('replay')
      }
      if (!isLogux && !meta.noAutoReason && !meta.dispatch) {
        meta.reasons.push('timeTravel')
      }
    })

    let wait = { }

    async function process (action, meta) {
      if (replaying) {
        wait[meta.id] = true
        await replaying
        if (wait[meta.id]) {
          delete wait[meta.id]
          await process(action, meta)
        }
        return
      }

      if (action.type === 'logux/undo') {
        let [undoAction, undoMeta] = await log.byId(action.id)
        if (undoAction) {
          log.changeMeta(meta.id, {
            reasons: undoMeta.reasons.filter(i => i !== 'syncing')
          })
          delete stateHistory[action.id]
          await replay(action.id)
        } else {
          await log.changeMeta(meta.id, { reasons: [] })
        }
        if (processing[action.id]) {
          let error = new Error(
            'Server undid Logux action because of ' + action.reason
          )
          error.action = action
          processing[action.id][1](error)
          delete processing[action.id]
        }
      } else if (!action.type.startsWith('logux/')) {
        if (isFirstOlder(prevMeta, meta)) {
          prevMeta = meta
          originDispatch(action)
          if (meta.added) saveHistory(meta)
        } else {
          await replay(meta.id)
          if (meta.reasons.includes('replay')) {
            log.changeMeta(meta.id, {
              reasons: meta.reasons.filter(i => i !== 'replay')
            })
          }
        }
      }
    }

    let lastAdded = 0
    let addCalls = 0
    client.on('add', (action, meta) => {
      if (meta.added > lastAdded) lastAdded = meta.added

      if (action.type === 'logux/processed') {
        if (processing[action.id]) {
          processing[action.id][0]()
          delete processing[action.id]
        }
      } else if (!meta.noAutoReason) {
        addCalls += 1
        if (addCalls % checkEvery === 0 && lastAdded > reasonlessHistory) {
          historyCleaned = true
          log.removeReason('timeTravel', {
            maxAdded: lastAdded - reasonlessHistory
          })
          log.removeReason('timeTravelTab' + store.client.tabId, {
            maxAdded: lastAdded - reasonlessHistory
          })
        }
      }

      if (!meta.dispatch) {
        let prevState = store.getState()
        process(action, meta).then(() => {
          emitter.emit('change', store.getState(), prevState, action, meta)
        })
      }
    })

    client.on('clean', (action, meta) => {
      delete wait[meta.id]
      delete stateHistory[meta.id]
    })

    let previous = []
    let ignores = { }
    log.each((action, meta) => {
      if (!meta.tab) {
        if (action.type === 'logux/undo') {
          ignores[action.id] = true
        } else if (!ignores[meta.id]) {
          previous.push([action, meta])
        }
      }
    }).then(() => {
      if (previous.length > 0) {
        Promise.all(previous.map(i => process(...i))).then(init)
      } else {
        init()
      }
    })

    return store
  }
}

module.exports = { createLoguxCreator }
