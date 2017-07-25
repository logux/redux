var createLoguxCreator = require('../create-logux-creator')

function reducer (state, action) {
  if (action.type === 'INC') {
    return { value: state.value + 1 }
  } else {
    return state
  }
}

function createStore () {
  var creator = createLoguxCreator({
    subprotocol: '1.0.0',
    userId: 10,
    url: 'wss://localhost:1337'
  })
  return creator(reducer, { value: 0 })
}

it('creates Redux store', function () {
  var store = createStore()
  store.dispatch({ type: 'INC' })
  expect(store.getState()).toEqual({ value: 1 })
})

it('creates Logux client', function () {
  var store = createStore()
  expect(store.client.options.subprotocol).toEqual('1.0.0')
})

it('sets tab ID', function () {
  var store = createStore()
  return new Promise(function (resolve) {
    store.client.log.on('add', function (action, meta) {
      expect(meta.tab).toEqual(store.client.id)
      expect(meta.reasons).toEqual(['tab' + store.client.id])
      resolve()
    })
    store.dispatch({ type: 'INC' })
  })
})

it('has shortcut for add', function () {
  var store = createStore()
  return store.add({ type: 'INC' }, { reasons: ['test'] }).then(function () {
    expect(store.getState()).toEqual({ value: 1 })
    expect(store.client.log.store.created[0][1].reasons).toEqual(['test'])
  })
})

it('has history', function () {
  var store = createStore()

  var prev = 0
  store.client.log.generateId = function () {
    prev += 1
    return [prev, 'test', 0]
  }

  return Promise.all([
    store.add({ type: 'A' }),
    store.add({ type: 'INC' }, { reasons: ['forever'] }),
    store.add({ type: 'INC' }, { reasons: ['temp'] })
  ]).then(function () {
    return store.client.log.removeReason('temp')
  }).then(function () {
    store.dispatch({ type: 'INC' })
    expect(store.history).toEqual({
      '2\ttest\t0': { value: 1 },
      1: { value: 3 }
    })
    return store.client.log.removeReason('tab' + store.client.id)
  }).then(function () {
    expect(store.history).toEqual({
      '2\ttest\t0': { value: 1 }
    })
  })
})