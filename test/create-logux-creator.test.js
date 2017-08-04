var createLoguxCreator = require('../create-logux-creator')

function createStore (reducer, opts) {
  if (!opts) opts = { }
  opts.subprotocol = '1.0.0'
  opts.server = 'wss://localhost:1337'
  opts.userId = 10

  var creator = createLoguxCreator(opts)
  var store = creator(reducer, { value: 0 })

  var prev = 0
  store.log.generateId = function () {
    prev += 1
    return [prev, 'test', 0]
  }

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

function actions (log) {
  return log.store.created.map(function (i) {
    return i[0]
  })
}

var originWarn = console.warn
afterEach(function () {
  console.warn = originWarn
})

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
  return store.dispatchCrossTab(
    { type: 'INC' }, { reasons: ['test'] }
  ).then(function () {
    expect(store.getState()).toEqual({ value: 1 })
    expect(store.log.store.created[0][1].reasons).toEqual(['test'])
  })
})

it('listen for action from other tabs', function () {
  var store = createStore(increment)
  store.client.emitter.emit('add', { type: 'INC' }, { })
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
        return store.dispatchCrossTab({ type: 'A' }, { reasons: ['test'] })
      })
    } else {
      store.dispatch({ type: 'A' })
    }
  }
  return promise.then(function () {
    expect(calls).toEqual(60)
    calls = 0
    return store.dispatchCrossTab(
      { type: 'A' }, { id: [57, 'test', 1], reasons: ['test'] })
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
    store.dispatchCrossTab({ type: 'A' }, { reasons: ['test'] }),
    store.dispatchCrossTab({ type: 'A' }, { reasons: ['test'] }),
    store.dispatchCrossTab({ type: 'A' }, { reasons: ['test'] }),
    store.dispatchCrossTab({ type: 'A' }, { reasons: ['test'] })
  ]).then(function () {
    calls = 0
    return store.dispatchCrossTab(
      { type: 'A' }, { id: [3, 'test', 1], reasons: ['test'] })
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

  return Promise.all([
    store.dispatchCrossTab({ type: 'A' }, { reasons: ['test'] }),
    store.dispatchCrossTab({ type: 'A' }, { reasons: ['test'] }),
    store.dispatchCrossTab({ type: 'A' }, { reasons: ['test'] }),
    store.dispatchCrossTab({ type: 'A' }, { reasons: ['test'] }),
    store.dispatchCrossTab({ type: 'A' }, { reasons: ['test'] }),
    store.dispatchCrossTab({ type: 'A' }, { reasons: ['test'] })
  ]).then(function () {
    return store.log.changeMeta([5, 'test', 0], { reasons: [] })
  }).then(function () {
    calls = 0
    return store.dispatchCrossTab(
      { type: 'A' }, { id: [5, 'test', 1], reasons: ['test'] })
  }).then(function () {
    expect(calls).toEqual(3)
  })
})

it('changes history', function () {
  var store = createStore(historyLine)

  return Promise.all([
    store.dispatchCrossTab({ type: 'ADD', value: 'a' }, { reasons: ['test'] }),
    store.dispatchCrossTab({ type: 'ADD', value: 'b' }, { reasons: ['test'] })
  ]).then(function () {
    store.dispatch({ type: 'ADD', value: 'c' })
    store.dispatch({ type: 'ADD', value: 'd' })
    return store.dispatchCrossTab(
      { type: 'ADD', value: '|' },
      { id: [2, 'test', 1], reasons: ['test'] })
  }).then(function () {
    expect(store.getState().value).toEqual('0ab|cd')
  })
})

it('undoes actions', function () {
  var store = createStore(historyLine)

  return Promise.all([
    store.dispatchCrossTab({ type: 'ADD', value: 'a' }, { reasons: ['test'] }),
    store.dispatchCrossTab({ type: 'ADD', value: 'b' }, { reasons: ['test'] }),
    store.dispatchCrossTab({ type: 'ADD', value: 'c' }, { reasons: ['test'] })
  ]).then(function () {
    expect(store.getState().value).toEqual('0abc')
    return store.dispatchCrossTab(
      { type: 'logux/undo', id: [2, 'test', 0] }, { reasons: ['test'] })
  }).then(function () {
    expect(store.getState().value).toEqual('0ac')
  })
})

it('warns about undoes cleaned action', function () {
  console.warn = jest.fn()
  var store = createStore(increment)

  return store.dispatchCrossTab(
    { type: 'logux/undo', id: [1, 't', 0] }, { reasons: [] }
  ).then(function () {
    expect(console.warn).toHaveBeenCalledWith(
      'Logux can not undo action [1,"t",0], because it did not find ' +
      'this action in the log. Maybe action was cleaned.'
    )
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
  return store.dispatchCrossTab(
    { type: 'ADD', value: 'z' },
    { id: [1, 'test', 1], reasons: ['test'] }
  ).then(function () {
    expect(store.getState().value).toEqual('0aZB')
  })
})

it('replays history since last state', function () {
  var onMissedHistory = jest.fn()
  var store = createStore(historyLine, {
    onMissedHistory: onMissedHistory,
    saveStateEvery: 2
  })
  return Promise.all([
    store.dispatchCrossTab({ type: 'ADD', value: 'a' }, { reasons: ['first'] }),
    store.dispatchCrossTab({ type: 'ADD', value: 'b' }, { reasons: ['test'] }),
    store.dispatchCrossTab({ type: 'ADD', value: 'c' }, { reasons: ['test'] }),
    store.dispatchCrossTab({ type: 'ADD', value: 'd' }, { reasons: ['test'] })
  ]).then(function () {
    return store.log.removeReason('first')
  }).then(function () {
    return store.dispatchCrossTab(
      { type: 'ADD', value: '|' },
      { id: [0, 'test', 0], reasons: ['test'] }
    )
  }).then(function () {
    expect(onMissedHistory).toHaveBeenCalledWith({ type: 'ADD', value: '|' })
    expect(store.getState().value).toEqual('0abc|d')
  })
})

it('replays actions on missed history', function () {
  var onMissedHistory = jest.fn()
  var store = createStore(historyLine, {
    onMissedHistory: onMissedHistory
  })
  return Promise.all([
    store.dispatchCrossTab({ type: 'ADD', value: 'a' }, { reasons: ['first'] }),
    store.dispatchCrossTab({ type: 'ADD', value: 'b' }, { reasons: ['test'] })
  ]).then(function () {
    return store.log.removeReason('first')
  }).then(function () {
    return store.dispatchCrossTab(
      { type: 'ADD', value: '|' },
      { id: [0, 'test', 0], reasons: ['test'] }
    )
  }).then(function () {
    expect(onMissedHistory).toHaveBeenCalledWith({ type: 'ADD', value: '|' })
    expect(store.getState().value).toEqual('0|b')
  })
})

it('does not fall on missed onMissedHistory', function () {
  var store = createStore(historyLine)
  return Promise.all([
    store.dispatchCrossTab({ type: 'ADD', value: 'a' }, { reasons: ['first'] })
  ]).then(function () {
    return store.log.removeReason('first')
  }).then(function () {
    return store.dispatchCrossTab(
      { type: 'ADD', value: '|' },
      { id: [0, 'test', 0], reasons: ['test'] }
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
    expect(actions(store.log)).toEqual([
      { type: 'ADD', value: 25 },
      { type: 'ADD', value: 24 },
      { type: 'ADD', value: 23 }
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
    expect(actions(store.log).length).toEqual(1000)
  })
})

it('copies reasons to undo action', function () {
  var store = createStore(increment)
  return store.dispatchCrossTab(
    { type: 'INC' }, { reasons: ['a', 'b'] }
  ).then(function () {
    return store.dispatchCrossTab(
      { type: 'logux/undo', id: [1, 'test', 0] }, { reasons: [] })
  }).then(function () {
    return store.log.byId([2, 'test', 0])
  }).then(function (result) {
    expect(result[0].type).toEqual('logux/undo')
    expect(result[1].reasons).toEqual(['a', 'b'])
  })
})

it('does not override undo action reasons', function () {
  var store = createStore(increment)
  return store.dispatchCrossTab(
    { type: 'INC' }, { reasons: ['a', 'b'] }
  ).then(function () {
    return store.dispatchCrossTab(
      { type: 'logux/undo', id: [1, 'test', 0] },
      { reasons: ['c'] }
    )
  }).then(function () {
    return store.log.byId([2, 'test', 0])
  }).then(function (result) {
    expect(result[0].type).toEqual('logux/undo')
    expect(result[1].reasons).toEqual(['c'])
  })
})

it('dispatches local actions', function () {
  var store = createStore(increment)
  return store.dispatchLocal(
    { type: 'INC' }, { reasons: ['test'] }
  ).then(function () {
    expect(store.log.store.created[0][0]).toEqual({ type: 'INC' })
    expect(store.log.store.created[0][1].tab).toEqual(store.client.id)
    expect(store.log.store.created[0][1].reasons).toEqual(['test'])
  })
})

it('dispatches sync actions', function () {
  var store = createStore(increment)
  return store.dispatchSync(
    { type: 'INC' }, { reasons: ['test'] }
  ).then(function () {
    expect(store.log.store.created[0][0]).toEqual({ type: 'INC' })
    expect(store.log.store.created[0][1].sync).toBeTruthy()
    expect(store.log.store.created[0][1].reasons).toEqual(['test'])
  })
})

it('throws on missed reasons', function () {
  var store = createStore(increment)
  expect(function () {
    store.dispatchLocal({ type: 'INC' })
  }).toThrowError(/meta.reasons/)
  expect(function () {
    store.dispatchCrossTab({ type: 'INC' }, { })
  }).toThrowError(/meta.reasons/)
  expect(function () {
    store.dispatchSync({ type: 'INC' })
  }).toThrowError(/meta.reasons/)
})
