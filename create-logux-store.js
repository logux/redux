var createStore = require('redux').createStore

module.exports = function (reducer, preloadedState, enhancer) {
  var store = createStore(reducer, preloadedState, enhancer)
  return store
}
