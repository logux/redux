var createLoguxCreator = require('../create-logux-creator')

function createStore (reducer) {
  var creator = createLoguxCreator({
    subprotocol: '1.0.0',
    userId: 10,
    url: 'wss://localhost:1337'
  })
  if (!reducer) {
    reducer = function (state, action) {
      if (action.type === 'INC') {
        return { value: state.value + 1 }
      } else {
        return state
      }
    }
  }
  var store = creator(reducer, { value: 0 })

  var prev = 0
  store.client.log.generateId = function () {
    prev += 1
    return [prev, 'test', 0]
  }

  return store
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

it('listen for action from other tabs', function () {
  var store = createStore()
  store.client.emitter.emit('add', { type: 'INC' }, { })
  expect(store.getState()).toEqual({ value: 1 })
})

it('has history', function () {
  var store = createStore(function (state, action) {
    return { value: action.type }
  })

  return Promise.all([
    store.add({ type: 'A' }),
    store.add({ type: 'B' }, { reasons: ['forever'] }),
    store.add({ type: 'C' }, { reasons: ['temp'] })
  ]).then(function () {
    return store.client.log.removeReason('temp')
  }).then(function () {
    store.dispatch({ type: 'D' })
    expect(store.history).toEqual({
      '2\ttest\t0': { value: 'B' },
      '4\ttest\t0': { value: 'D' }
    })
    return store.client.log.removeReason('tab' + store.client.id)
  }).then(function () {
    expect(store.history).toEqual({
      '2\ttest\t0': { value: 'B' }
    })
  })
})

it('changes history', function () {
  var store = createStore(function (state, action) {
    if (action.type === 'ADD') {
      return { value: state.value + action.value }
    } else {
      return state
    }
  })

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
    expect(store.history).toEqual({
      '1\ttest\t0': { value: '0a' },
      '2\ttest\t0': { value: '0ab' },
      '2\ttest\t1': { value: '0ab|' },
      '3\ttest\t0': { value: '0ab|c' },
      '4\ttest\t0': { value: '0ab|cd' }
    })
  })
})
