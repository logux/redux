var initialState = {}

function loguxReducer (state, action) {
  if (!state) {
    state = initialState
  }

  var type = action.type
  if (type === 'logux/start') {
    state = action.config
  } else if (type === 'logux/started') {
    state = Object.assign({}, state, { started: true })
  }
  return state
}

module.exports = loguxReducer
