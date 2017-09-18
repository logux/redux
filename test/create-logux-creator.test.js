var TestPair = require('logux-sync').TestPair
var TestTime = require('logux-core').TestTime

var createLoguxCreator = require('../create-logux-creator')

function createStore (reducer, opts) {
  if (!opts) opts = { }
  if (!opts.server) opts.server = 'wss://localhost:1337'
  opts.subprotocol = '1.0.0'
  opts.userId = 10

  var creator = createLoguxCreator(opts)
  var store = creator(reducer, { value: 0 })

  var prev = 0
  store.log.generateId = function () {
    prev += 1
    return [prev, store.client.options.userId + ':uuid', 0]
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
  return store.dispatch.crossTab(
    { type: 'INC' }, { reasons: ['test'] }
  ).then(function () {
    expect(store.getState()).toEqual({ value: 1 })
    expect(store.log.store.created[0][1].reasons).toEqual(['test'])
  })
})

it('listen for action from other tabs', function () {
  var store = createStore(increment)
  store.client.emitter.emit('add', { type: 'INC' }, { id: [1, 't', 0] })
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
      { type: 'A' }, { id: [57, '10:uuid', 1], reasons: ['test'] })
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
      { type: 'A' }, { id: [3, '10:uuid', 1], reasons: ['test'] })
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
    store.dispatch.crossTab({ type: 'A' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'A' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'A' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'A' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'A' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'A' }, { reasons: ['test'] })
  ]).then(function () {
    return store.log.changeMeta([5, '10:uuid', 0], { reasons: [] })
  }).then(function () {
    calls = 0
    return store.dispatch.crossTab(
      { type: 'A' }, { id: [5, '10:uuid', 1], reasons: ['test'] })
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
      { id: [2, '10:uuid', 1], reasons: ['test'] })
  }).then(function () {
    expect(store.getState().value).toEqual('0ab|cd')
  })
})

it('undoes actions', function () {
  var store = createStore(historyLine)

  return Promise.all([
    store.dispatch.crossTab({ type: 'ADD', value: 'a' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'ADD', value: 'b' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'ADD', value: 'c' }, { reasons: ['test'] })
  ]).then(function () {
    expect(store.getState().value).toEqual('0abc')
    return store.dispatch.crossTab(
      { type: 'logux/undo', id: [2, '10:uuid', 0] }, { reasons: ['test'] })
  }).then(function () {
    expect(store.getState().value).toEqual('0ac')
  })
})

it('warns about undoes cleaned action', function () {
  console.warn = jest.fn()
  var store = createStore(increment)

  return store.dispatch.crossTab(
    { type: 'logux/undo', id: [1, 't', 0] }, { reasons: [] }
  ).then(function () {
    expect(console.warn).toHaveBeenCalledWith(
      'Logux can not find [1,"t",0] to undo it. Maybe action was cleaned.'
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
  return store.dispatch.crossTab(
    { type: 'ADD', value: 'z' },
    { id: [1, '10:uuid', 1], reasons: ['test'] }
  ).then(function () {
    expect(store.getState().value).toEqual('0aZB')
  })
})

it('replays history since last state', function () {
  var onMissedHistory = jest.fn()
  var store = createStore(historyLine, {
    onMissedHistory: onMissedHistory,
    saveStateEvery: 2,
    time: new TestTime()
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
      { id: [1, '10:uuid', 0], reasons: ['test'] }
    )
  }).then(function () {
    expect(onMissedHistory).toHaveBeenCalledWith({ type: 'ADD', value: '|' })
    expect(store.getState().value).toEqual('0abc|d')
  })
})

it('replays actions before staring since initial state', function () {
  var onMissedHistory = jest.fn()
  var store = createStore(historyLine, {
    onMissedHistory: onMissedHistory,
    saveStateEvery: 2,
    time: new TestTime()
  })
  return Promise.all([
    store.dispatch.crossTab({ type: 'ADD', value: 'b' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'ADD', value: 'c' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'ADD', value: 'd' }, { reasons: ['test'] })
  ]).then(function () {
    return store.dispatch.crossTab(
      { type: 'ADD', value: '|' },
      { id: [0, '10:uuid', 0], reasons: ['test'] }
    )
  }).then(function () {
    expect(store.getState().value).toEqual('0|bcd')
  })
})

it('replays actions on missed history', function () {
  var onMissedHistory = jest.fn()
  var store = createStore(historyLine, {
    onMissedHistory: onMissedHistory
  })
  return Promise.all([
    store.dispatch.crossTab({ type: 'ADD', value: 'a' }, { reasons: ['one'] }),
    store.dispatch.crossTab({ type: 'ADD', value: 'b' }, { reasons: ['test'] })
  ]).then(function () {
    return store.log.removeReason('one')
  }).then(function () {
    return store.dispatch.crossTab(
      { type: 'ADD', value: '|' },
      { id: [0, '10:uuid', 0], reasons: ['test'] }
    )
  }).then(function () {
    expect(onMissedHistory).toHaveBeenCalledWith({ type: 'ADD', value: '|' })
    expect(store.getState().value).toEqual('0|b')
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
      { id: [0, '10:uuid', 0], reasons: ['test'] }
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
  return store.dispatch.crossTab(
    { type: 'INC' }, { reasons: ['a', 'b'] }
  ).then(function () {
    return store.dispatch.crossTab(
      { type: 'logux/undo', id: [1, '10:uuid', 0] }, { reasons: [] })
  }).then(function () {
    return store.log.byId([2, '10:uuid', 0])
  }).then(function (result) {
    expect(result[0].type).toEqual('logux/undo')
    expect(result[1].reasons).toEqual(['a', 'b'])
  })
})

it('does not override undo action reasons', function () {
  var store = createStore(increment)
  return store.dispatch.crossTab(
    { type: 'INC' }, { reasons: ['a', 'b'] }
  ).then(function () {
    return store.dispatch.crossTab(
      { type: 'logux/undo', id: [1, '10:uuid', 0] },
      { reasons: ['c'] }
    )
  }).then(function () {
    return store.log.byId([2, '10:uuid', 0])
  }).then(function (result) {
    expect(result[0].type).toEqual('logux/undo')
    expect(result[1].reasons).toEqual(['c'])
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

it('dispatches sync actions', function () {
  var store = createStore(increment)
  return store.dispatch.sync(
    { type: 'INC' }, { reasons: ['test'] }
  ).then(function () {
    var log = store.log.store.created
    expect(log[0][0]).toEqual({ type: 'INC' })
    expect(log[0][1].sync).toBeTruthy()
    expect(log[0][1].reasons).toEqual(['test', 'waitForSync'])
  })
})

it('cleans sync action after synchronization', function () {
  var pair = new TestPair()
  var store = createStore(increment, { server: pair.left })

  store.client.start()
  return pair.wait('left').then(function () {
    var protocol = store.client.sync.localProtocol
    pair.right.send(['connected', protocol, 'server', [0, 0]])
    return store.client.sync.waitFor('synchronized')
  }).then(function () {
    store.dispatch.sync({ type: 'INC' })
    return pair.wait('right')
  }).then(function () {
    expect(actions(store.log)).toEqual([{ type: 'INC' }])
    pair.right.send(['synced', 1])
    return store.client.sync.waitFor('synchronized')
  }).then(function () {
    return Promise.resolve()
  }).then(function () {
    expect(actions(store.log)).toEqual([])
  })
})

it('applies old actions from store', function () {
  var store1 = createStore(historyLine)
  var store2
  return Promise.all([
    store1.dispatch.crossTab(
      { type: 'ADD', value: '1' }, { id: [0, '10:x', 1], reasons: ['test'] }
    ),
    store1.dispatch.crossTab(
      { type: 'ADD', value: '2' }, { id: [0, '10:x', 2], reasons: ['test'] }
    ),
    store1.dispatch.crossTab(
      { type: 'ADD', value: '3' }, { id: [0, '10:x', 3], reasons: ['test'] }
    ),
    store1.dispatch.crossTab(
      { type: 'ADD', value: '4' }, { id: [0, '10:x', 4], reasons: ['test'] }
    ),
    store1.log.add(
      { type: 'ADD', value: '5' },
      { id: [0, '10:x', 5], reasons: ['test'], tab: store1.client.id }
    ),
    store1.dispatch.crossTab(
      { type: 'logux/undo', id: [0, '10:x', 2] },
      { id: [0, '10:x', 6], reasons: ['test'] }
    )
  ]).then(function () {
    store2 = createStore(historyLine, { store: store1.log.store })

    store2.dispatch({ type: 'ADD', value: 'a' })
    store2.dispatch.crossTab(
      { type: 'ADD', value: 'b' }, { reasons: ['test'] }
    )
    expect(store2.getState().value).toEqual('0a')

    return store2.initialize
  }).then(function () {
    expect(store2.getState().value).toEqual('0134ab')
  })
})
