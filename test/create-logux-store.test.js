var createLoguxStore = require('../create-logux-store')

function reducer (state, action) {
  if (action.type === 'INC') {
    return { value: state.value + 1 }
  } else {
    return state
  }
}

it('creates Redux store', function () {
  var store = createLoguxStore(reducer, { value: 0 })
  store.dispatch({ type: 'INC' })
  expect(store.getState()).toEqual({ value: 1 })
})
