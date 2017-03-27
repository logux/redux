var createStore = require('redux').createStore
var Client = require('logux-client/client')

module.exports = function (reducer, preloadedState, enhancer, config) {
  var store = createStore(reducer, preloadedState, enhancer)
  store.client = new Client(config)
  return store
}
