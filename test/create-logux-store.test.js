var createLoguxStore = require('../create-logux-store')

function reducer (state, action) {
  if (action.type === 'INC') {
    return { value: state.value + 1 }
  } else {
    return state
  }
}

function createStore () {
  return createLoguxStore(reducer, { value: 0 }, undefined, {
    subprotocol: '1.0.0',
    userId: 10,
    url: 'wss://localhost:1337'
  })
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
