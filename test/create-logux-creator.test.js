var createLoguxCreator = require('../create-logux-creator')

function createStore (reducer, opts) {
  if (!opts) opts = { }
  opts.subprotocol = '1.0.0'
  opts.userId = 10
  opts.url = 'wss://localhost:1337'

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

var originWarn = console.warn
afterEach(function () {
  console.warn = originWarn
})

it('throws error on missed config', function () {
  expect(function () {
    createLoguxCreator()
  }).toThrowError('Missed url option in Logux client')
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
  return store.add({ type: 'INC' }, { reasons: ['test'] }).then(function () {
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
        return store.add({ type: 'A' }, { reasons: ['test'] })
      })
    } else {
      store.dispatch({ type: 'A' })
    }
  }
  return promise.then(function () {
    expect(calls).toEqual(60)
    calls = 0
    return store.add({ type: 'A' }, { id: [57, 'test', 1], reasons: ['test'] })
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
    store.add({ type: 'A' }, { reasons: ['test'] }),
    store.add({ type: 'A' }, { reasons: ['test'] }),
    store.add({ type: 'A' }, { reasons: ['test'] }),
    store.add({ type: 'A' }, { reasons: ['test'] })
  ]).then(function () {
    calls = 0
    return store.add({ type: 'A' }, { id: [3, 'test', 1], reasons: ['test'] })
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
    store.add({ type: 'A' }, { reasons: ['test'] }),
    store.add({ type: 'A' }, { reasons: ['test'] }),
    store.add({ type: 'A' }, { reasons: ['test'] }),
    store.add({ type: 'A' }, { reasons: ['test'] }),
    store.add({ type: 'A' }, { reasons: ['test'] }),
    store.add({ type: 'A' }, { reasons: ['test'] })
  ]).then(function () {
    return store.log.changeMeta([5, 'test', 0], { reasons: [] })
  }).then(function () {
    calls = 0
    return store.add({ type: 'A' }, { id: [5, 'test', 1], reasons: ['test'] })
  }).then(function () {
    expect(calls).toEqual(3)
  })
})

it('changes history', function () {
  var store = createStore(historyLine)

  return Promise.all([
    store.add({ type: 'ADD', value: 'a' }, { reasons: ['test'] }),
    store.add({ type: 'ADD', value: 'b' }, { reasons: ['test'] })
  ]).then(function () {
    store.dispatch({ type: 'ADD', value: 'c' })
    store.dispatch({ type: 'ADD', value: 'd' })
    return store.add(
      { type: 'ADD', value: '|' },
      { id: [2, 'test', 1], reasons: ['test'] })
  }).then(function () {
    expect(store.getState().value).toEqual('0ab|cd')
  })
})

it('undoes actions', function () {
  var store = createStore(historyLine)

  return Promise.all([
    store.add({ type: 'ADD', value: 'a' }, { reasons: ['test'] }),
    store.add({ type: 'ADD', value: 'b' }, { reasons: ['test'] }),
    store.add({ type: 'ADD', value: 'c' }, { reasons: ['test'] })
  ]).then(function () {
    expect(store.getState().value).toEqual('0abc')
    return store.add(
      { type: 'logux/undo', id: [2, 'test', 0] }, { reasons: ['test'] })
  }).then(function () {
    expect(store.getState().value).toEqual('0ac')
  })
})

it('warns about undoes cleaned action', function () {
  console.warn = jest.fn()
  var store = createStore(increment)

  return store.add({ type: 'logux/undo', id: [1, 't', 0] }).then(function () {
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
  return store.add(
    { type: 'ADD', value: 'z' },
    { id: [1, 'test', 1], reasons: ['test'] }
  ).then(function () {
    expect(store.getState().value).toEqual('0aZB')
  })
})
