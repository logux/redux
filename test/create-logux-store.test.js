var createLoguxStore = require('../create-logux-store')

function reducer (state, action) {
  if (action.type === 'INC') {
    return { value: state.value + 1 }
  } else {
    return state
  }
}

it('creates Redux store', function () {
  var store = createLoguxStore(reducer, { value: 0 }, undefined, {
    subprotocol: '1.0.0',
    userId: 10,
    url: 'wss://localhost:1337'
  })
  store.dispatch({ type: 'INC' })
  expect(store.getState()).toEqual({ value: 1 })
})

it('creates Logux client', function () {
  var store = createLoguxStore(reducer, { value: 0 }, undefined, {
    subprotocol: '1.0.0',
    userId: 10,
    url: 'wss://localhost:1337'
  })
  expect(store.client.options.subprotocol).toEqual('1.0.0')
})
