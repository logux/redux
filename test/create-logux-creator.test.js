var applyMiddleware = require('redux').applyMiddleware
var TestPair = require('@logux/core').TestPair
var TestTime = require('@logux/core').TestTime
var delay = require('nanodelay')

var createLoguxCreator = require('../create-logux-creator')

function createStore (reducer, opts, enhancer) {
  if (!opts) opts = { }
  if (!opts.server) opts.server = 'wss://localhost:1337'
  opts.subprotocol = '1.0.0'
  opts.userId = 10
  opts.time = new TestTime()

  var creator = createLoguxCreator(opts)
  var store = creator(reducer, { value: 0 }, enhancer)

  return store
}

function increment (state, action) {
  if (action.type === 'INC') {
    return { value: state.value + 1 }
  } else {
    return state
  }
}

function historyLine (state, action) {
  if (action.type === 'ADD') {
    return { value: state.value + action.value }
  } else {
    return state
  }
}

it('throws error on missed config', function () {
  expect(function () {
    createLoguxCreator()
  }).toThrowError('Missed server option in Logux client')
})

it('creates Redux store', function () {
  var store = createStore(increment)
  store.dispatch({ type: 'INC' })
  expect(store.getState()).toEqual({ value: 1 })
})

it('creates Logux client', function () {
  var store = createStore(increment)
  expect(store.client.options.subprotocol).toEqual('1.0.0')
})

it('sets tab ID', function () {
  var store = createStore(increment)
  return new Promise(function (resolve) {
    store.log.on('add', function (action, meta) {
      expect(meta.tab).toEqual(store.client.id)
      expect(meta.reasons).toEqual(['tab' + store.client.id])
      resolve()
    })
    store.dispatch({ type: 'INC' })
  })
})

it('has shortcut for add', function () {
  var store = createStore(increment)
  return store.dispatch.crossTab(
    { type: 'INC' }, { reasons: ['test'] }
  ).then(function () {
    expect(store.getState()).toEqual({ value: 1 })
    expect(store.log.store.created[0][1].reasons).toEqual(['test'])
  })
})

it('listen for action from other tabs', function () {
  var store = createStore(increment)
  store.client.emitter.emit('add', { type: 'INC' }, { id: '1 t 0' })
  expect(store.getState()).toEqual({ value: 1 })
})

it('saves previous states', function () {
  var calls = 0
  var store = createStore(function (state, action) {
    if (action.type === 'A') calls += 1
    return state
  })

  var promise = Promise.resolve()
  for (var i = 0; i < 60; i++) {
    if (i % 2 === 0) {
      promise = promise.then(function () {
        return store.dispatch.crossTab({ type: 'A' }, { reasons: ['test'] })
      })
    } else {
      store.dispatch({ type: 'A' })
    }
  }
  return promise.then(function () {
    expect(calls).toEqual(60)
    calls = 0
    return store.dispatch.crossTab(
      { type: 'A' }, { id: '57 10:test1 1', reasons: ['test'] })
  }).then(function () {
    expect(calls).toEqual(10)
  })
})

it('changes history recording frequency', function () {
  var calls = 0
  var store = createStore(function (state, action) {
    if (action.type === 'A') calls += 1
    return state
  }, {
    saveStateEvery: 1
  })

  return Promise.all([
    store.dispatch.crossTab({ type: 'A' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'A' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'A' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'A' }, { reasons: ['test'] })
  ]).then(function () {
    calls = 0
    return store.dispatch.crossTab(
      { type: 'A' }, { id: '3 10:test1 1', reasons: ['test'] })
  }).then(function () {
    expect(calls).toEqual(2)
  })
})

it('cleans its history on removing action', function () {
  var calls = 0
  var store = createStore(function (state, action) {
    if (action.type === 'A') calls += 1
    return state
  }, {
    saveStateEvery: 2
  })
  var nodeId = store.client.nodeId

  return Promise.all([
    store.dispatch.crossTab({ type: 'A' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'A' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'A' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'A' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'A' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'A' }, { reasons: ['test'] })
  ]).then(function () {
    return store.log.changeMeta('5 ' + nodeId + ' 0', { reasons: [] })
  }).then(function () {
    calls = 0
    return store.dispatch.crossTab(
      { type: 'A' }, { id: '5 ' + nodeId + ' 1', reasons: ['test'] })
  }).then(function () {
    expect(calls).toEqual(3)
  })
})

it('changes history', function () {
  var store = createStore(historyLine)

  return Promise.all([
    store.dispatch.crossTab({ type: 'ADD', value: 'a' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'ADD', value: 'b' }, { reasons: ['test'] })
  ]).then(function () {
    store.dispatch({ type: 'ADD', value: 'c' })
    store.dispatch({ type: 'ADD', value: 'd' })
    return store.dispatch.crossTab(
      { type: 'ADD', value: '|' },
      { id: '2 10:test1 1', reasons: ['test'] })
  }).then(function () {
    expect(store.getState().value).toEqual('0ab|cd')
  })
})

it('undoes actions', function () {
  var store = createStore(historyLine)
  var nodeId = store.client.nodeId

  return Promise.all([
    store.dispatch.crossTab({ type: 'ADD', value: 'a' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'ADD', value: 'b' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'ADD', value: 'c' }, { reasons: ['test'] })
  ]).then(function () {
    expect(store.getState().value).toEqual('0abc')
    return store.dispatch.crossTab(
      { type: 'logux/undo', id: '2 ' + nodeId + ' 0' }, { reasons: ['test'] })
  }).then(function () {
    expect(store.getState().value).toEqual('0ac')
  })
})

it('replaces reducer', function () {
  var store = createStore(historyLine)
  store.dispatch({ type: 'ADD', value: 'a' })
  store.dispatch({ type: 'ADD', value: 'b' })
  expect(store.getState().value).toEqual('0ab')

  store.replaceReducer(function (state, action) {
    if (action.type === 'ADD') {
      return { value: state.value + action.value.toUpperCase() }
    } else {
      return state
    }
  })
  return store.dispatch.crossTab(
    { type: 'ADD', value: 'z' },
    { id: '1 10:test1 1', reasons: ['test'] }
  ).then(function () {
    expect(store.getState().value).toEqual('0aZB')
  })
})

it('ignores cleaned history from non-legacy actions', function () {
  var onMissedHistory = jest.fn()
  var store = createStore(historyLine, {
    onMissedHistory: onMissedHistory,
    saveStateEvery: 2
  })
  return Promise.all([
    store.dispatch.crossTab({ type: 'ADD', value: 'a' }, { reasons: ['one'] }),
    store.dispatch.crossTab({ type: 'ADD', value: 'b' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'ADD', value: 'c' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'ADD', value: 'd' }, { reasons: ['test'] })
  ]).then(function () {
    return store.log.removeReason('one')
  }).then(function () {
    return store.dispatch.crossTab(
      { type: 'ADD', value: '|' },
      { id: '1 10:test1 0', reasons: ['test'] }
    )
  }).then(function () {
    expect(store.getState().value).toEqual('0|bcd')
    expect(onMissedHistory).not.toHaveBeenCalledWith()
  })
})

it('does not replays actions on logux/ actions', function () {
  var reduced = []
  var store = createStore(function (state, action) {
    if (action.type.slice(0, 2) !== '@@') reduced.push(action.type)
    return state
  })
  return store.log.add({ type: 'A' }, { reasons: ['t'] }).then(function () {
    return store.log.add({ type: 'logux/processed' }, { time: 0 })
  }).then(function () {
    return store.log.add({ type: 'logux/subscribe' }, { sync: true, time: 0 })
  }).then(function () {
    return store.log.add({ type: 'logux/unsubscribe' }, { sync: true, time: 0 })
  }).then(function () {
    return store.log.add({ type: 'B' }, { reasons: ['t'], time: 0 })
  }).then(function () {
    expect(reduced).toEqual(['A', 'B', 'A'])
    expect(store.log.actions()).toEqual([
      { type: 'logux/subscribe' },
      { type: 'logux/unsubscribe' },
      { type: 'B' },
      { type: 'A' }
    ])
  })
})

it('replays history for reason-less action', function () {
  var store = createStore(historyLine)
  return Promise.all([
    store.dispatch.crossTab({ type: 'ADD', value: 'a' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'ADD', value: 'b' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'ADD', value: 'c' }, { reasons: ['test'] })
  ]).then(function () {
    return store.dispatch.crossTab(
      { type: 'ADD', value: '|' }, { id: '1 10:test1 1' }
    )
  }).then(function () {
    return Promise.resolve()
  }).then(function () {
    expect(store.getState().value).toEqual('0a|bc')
    expect(store.log.store.created).toHaveLength(3)
  })
})

it('replays actions before staring since initial state', function () {
  var onMissedHistory = jest.fn()
  var store = createStore(historyLine, {
    onMissedHistory: onMissedHistory,
    saveStateEvery: 2
  })
  return Promise.all([
    store.dispatch.crossTab({ type: 'ADD', value: 'b' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'ADD', value: 'c' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'ADD', value: 'd' }, { reasons: ['test'] })
  ]).then(function () {
    return store.dispatch.crossTab(
      { type: 'ADD', value: '|' },
      { id: '0 10:test1 0', reasons: ['test'] }
    )
  }).then(function () {
    expect(onMissedHistory).not.toHaveBeenCalled()
    expect(store.getState().value).toEqual('0|bcd')
  })
})

it('replays actions on missed history', function () {
  var onMissedHistory = jest.fn()
  var store = createStore(historyLine, {
    dispatchHistory: 2,
    onMissedHistory: onMissedHistory,
    saveStateEvery: 2,
    checkEvery: 1
  })
  store.dispatch({ type: 'ADD', value: 'a' })
  store.dispatch({ type: 'ADD', value: 'b' })
  store.dispatch({ type: 'ADD', value: 'c' })
  store.dispatch({ type: 'ADD', value: 'd' })
  return Promise.resolve().then(function () {
    return store.dispatch.crossTab(
      { type: 'ADD', value: '[' },
      { id: '0 10:test1 0', reasons: ['test'] }
    )
  }).then(function () {
    expect(store.getState().value).toEqual('0abc[d')
    expect(onMissedHistory).toHaveBeenCalledWith({ type: 'ADD', value: '[' })
    return store.dispatch.crossTab(
      { type: 'ADD', value: ']' },
      { id: '0 10:test1 1', reasons: ['test'] }
    )
  }).then(function () {
    expect(store.getState().value).toEqual('0abc[]d')
  })
})

it('works without onMissedHistory', function () {
  var store = createStore(historyLine, {
    dispatchHistory: 2,
    saveStateEvery: 2,
    checkEvery: 1
  })
  store.dispatch({ type: 'ADD', value: 'a' })
  store.dispatch({ type: 'ADD', value: 'b' })
  store.dispatch({ type: 'ADD', value: 'c' })
  store.dispatch({ type: 'ADD', value: 'd' })
  return Promise.resolve().then(function () {
    return store.dispatch.crossTab(
      { type: 'ADD', value: '|' },
      { id: '0 10:test1 0', reasons: ['test'] }
    )
  })
})

it('does not fall on missed onMissedHistory', function () {
  var store = createStore(historyLine)
  return Promise.all([
    store.dispatch.crossTab({ type: 'ADD', value: 'a' }, { reasons: ['first'] })
  ]).then(function () {
    return store.log.removeReason('first')
  }).then(function () {
    return store.dispatch.crossTab(
      { type: 'ADD', value: '|' },
      { id: '0 10:test1 0', reasons: ['test'] }
    )
  }).then(function () {
    expect(store.getState().value).toEqual('0|')
  })
})

it('cleans action added by dispatch', function () {
  var store = createStore(historyLine, {
    dispatchHistory: 3
  })

  function add (index) {
    return function () {
      store.dispatch({ type: 'ADD', value: index })
    }
  }

  var promise = Promise.resolve()
  for (var i = 1; i <= 25; i++) {
    promise = promise.then(add(i))
  }

  return promise.then(function () {
    expect(store.log.actions()).toEqual([
      { type: 'ADD', value: 23 },
      { type: 'ADD', value: 24 },
      { type: 'ADD', value: 25 }
    ])
  })
})

it('cleans last 1000 by default', function () {
  var store = createStore(increment)

  var promise = Promise.resolve()
  for (var i = 0; i < 1050; i++) {
    promise = promise.then(function () {
      store.dispatch({ type: 'INC' })
    })
  }

  return promise.then(function () {
    expect(store.log.actions()).toHaveLength(1000)
  })
})

it('copies reasons to undo action', function () {
  var store = createStore(increment)
  var nodeId = store.client.nodeId
  return store.dispatch.crossTab(
    { type: 'INC' }, { reasons: ['a', 'b'] }
  ).then(function () {
    return store.dispatch.crossTab(
      { type: 'logux/undo', id: '1 ' + nodeId + ' 0' }, { reasons: [] })
  }).then(function () {
    return store.log.byId('2 ' + nodeId + ' 0')
  }).then(function (result) {
    expect(result[0].type).toEqual('logux/undo')
    expect(result[1].reasons).toEqual(['a', 'b'])
  })
})

it('dispatches local actions', function () {
  var store = createStore(increment)
  return store.dispatch.local(
    { type: 'INC' }, { reasons: ['test'] }
  ).then(function () {
    expect(store.log.store.created[0][0]).toEqual({ type: 'INC' })
    expect(store.log.store.created[0][1].tab).toEqual(store.client.id)
    expect(store.log.store.created[0][1].reasons).toEqual(['test'])
  })
})

it('allows to miss meta for local actions', function () {
  var store = createStore(increment)
  store.log.on('preadd', function (action, meta) {
    meta.reasons.push('preadd')
  })
  return store.dispatch.local({ type: 'INC' }).then(function () {
    expect(store.log.store.created[0][0]).toEqual({ type: 'INC' })
  })
})

it('dispatches sync actions', function () {
  var store = createStore(increment)
  store.dispatch.sync({ type: 'INC' }, { reasons: ['test'] })
  return Promise.resolve().then(function () {
    var log = store.log.store.created
    expect(log[0][0]).toEqual({ type: 'INC' })
    expect(log[0][1].sync).toBeTruthy()
    expect(log[0][1].reasons).toEqual(['test', 'syncing'])
  })
})

it('cleans sync action after processing', function () {
  jest.spyOn(console, 'warn').mockImplementation(function () { })
  var pair = new TestPair()
  var store = createStore(increment, { server: pair.left })
  var resultA, resultB

  store.dispatch.sync({ type: 'A' }).then(function () {
    resultA = 'processed'
  }).catch(function (e) {
    expect(e.message).toContain('undo')
    resultA = e.action.reason
  })
  store.dispatch.sync({ type: 'B' }, { id: '3 10:1:1 0' }).then(function () {
    resultB = 'processed'
  }).catch(function (e) {
    expect(e.message).toContain('undo')
    resultB = e.action.reason
  })
  return store.log.add(
    { type: 'logux/processed', id: '0 10:1:1 0' }
  ).then(function () {
    expect(resultA).toBeUndefined()
    expect(resultB).toBeUndefined()
    expect(store.log.actions()).toEqual([{ type: 'A' }, { type: 'B' }])
    return store.log.add({ type: 'logux/processed', id: '1 10:1:1 0' })
  }).then(function () {
    expect(resultA).toEqual('processed')
    expect(resultB).toBeUndefined()
    expect(store.log.actions()).toEqual([{ type: 'B' }])
    store.log.add({ type: 'logux/undo', reason: 'error', id: '3 10:1:1 0' })
    return delay(1)
  }).then(function () {
    expect(resultB).toEqual('error')
    expect(store.log.actions()).toEqual([])
    expect(console.warn).not.toHaveBeenCalled()
  })
})

it('applies old actions from store', function () {
  var store1 = createStore(historyLine, { dispatchHistory: 2 })
  var store2
  return Promise.all([
    store1.dispatch.crossTab(
      { type: 'ADD', value: '1' }, { id: '0 10:x 1', reasons: ['test'] }
    ),
    store1.dispatch.crossTab(
      { type: 'ADD', value: '2' }, { id: '0 10:x 2', reasons: ['test'] }
    ),
    store1.dispatch.crossTab(
      { type: 'ADD', value: '3' }, { id: '0 10:x 3', reasons: ['test'] }
    ),
    store1.dispatch.crossTab(
      { type: 'ADD', value: '4' }, { id: '0 10:x 4', reasons: ['test'] }
    ),
    store1.log.add(
      { type: 'ADD', value: '5' },
      { id: '0 10:x 5', reasons: ['test'], tab: 'test2' }
    ),
    store1.dispatch.crossTab(
      { type: 'logux/undo', id: '0 10:x 2' },
      { id: '0 10:x 6', reasons: ['test'] }
    )
  ]).then(function () {
    store2 = createStore(historyLine, { store: store1.log.store })

    store2.dispatch({ type: 'ADD', value: 'a' })
    store2.dispatch({ type: 'ADD', value: 'b' })
    store2.dispatch.crossTab(
      { type: 'ADD', value: 'c' }, { reasons: ['test'] }
    )
    store2.dispatch({ type: 'ADD', value: 'd' })
    store2.dispatch({ type: 'ADD', value: 'e' })
    expect(store2.getState().value).toEqual('0abde')

    return store2.initialize
  }).then(function () {
    expect(store2.getState().value).toEqual('0134abcde')
  })
})

it('supports middlewares', function () {
  var store = createStore(historyLine, { }, applyMiddleware(function () {
    return function (dispatch) {
      return function (action) {
        if (action.value !== 'a') {
          dispatch(action)
        }
      }
    }
  }))

  store.dispatch({ type: 'ADD', value: 'a' })
  store.dispatch({ type: 'ADD', value: 'b' })
  expect(store.getState().value).toEqual('0b')
})

it('waits for replaying', function () {
  var store = createStore(historyLine)
  var run
  var waiting = new Promise(function (resolve) {
    run = resolve
  })

  var first = true
  var originEach = store.log.each
  store.log.each = function () {
    var result = originEach.apply(this, arguments)
    if (first) {
      first = false
      return waiting.then(function () {
        return result
      })
    } else {
      return result
    }
  }

  return store.dispatch.crossTab(
    { type: 'ADD', value: 'b' },
    { reasons: ['t'] }
  ).then(function () {
    return store.dispatch.crossTab(
      { type: 'ADD', value: 'a' },
      { id: '0 test 0', reasons: ['t'] }
    )
  }).then(function () {
    return Promise.all([
      store.dispatch.crossTab({ type: 'ADD', value: 'c' }, { reasons: ['o'] }),
      store.dispatch.crossTab({ type: 'ADD', value: 'd' }, { reasons: ['t'] })
    ])
  }).then(function () {
    expect(store.getState().value).toEqual('0b')
    store.log.removeReason('o')
    run()
    return Promise.resolve()
  }).then(function () {
    return Promise.resolve()
  }).then(function () {
    return Promise.resolve()
  }).then(function () {
    expect(store.getState().value).toEqual('0abd')
  })
})

it('emits change event', function () {
  var store = createStore(historyLine)

  store.log.on('preadd', function (action, meta) {
    meta.reasons.push('test')
  })

  var calls = []
  store.on('change', function (state, prevState, action, meta) {
    expect(typeof meta.id).toEqual('string')
    calls.push([state, prevState, action])
  })

  store.dispatch({ type: 'ADD', value: 'a' })
  return store.dispatch.local({ type: 'ADD', value: 'c' }).then(function () {
    store.dispatch.local({ type: 'ADD', value: 'b' }, { id: '1 10:test1 1' })
    return delay(10)
  }).then(function () {
    expect(calls).toEqual([
      [
        { value: '0a' },
        { value: 0 },
        { type: 'ADD', value: 'a' }
      ],
      [
        { value: '0ac' },
        { value: '0a' },
        { type: 'ADD', value: 'c' }
      ],
      [
        { value: '0abc' },
        { value: '0ac' },
        { type: 'ADD', value: 'b' }
      ]
    ])
  })
})

it('warns about undoes cleaned action', function () {
  var store = createStore(increment)

  return store.dispatch.crossTab(
    { type: 'logux/undo', id: '1 t 0' }
  ).then(function () {
    expect(store.log.actions()).toHaveLength(0)
  })
})
