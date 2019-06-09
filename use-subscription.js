var ReactReduxContext = require('react-redux').ReactReduxContext
var useContext = require('react').useContext
var useEffect = require('react').useEffect
var useState = require('react').useState

function add (store, subscriptions) {
  if (!store.subscriptions) store.subscriptions = { }
  if (!store.subscribers) store.subscribers = { }

  return Promise.all(subscriptions.map(function (i) {
    var subscription = i[0]
    var json = i[1]
    if (!store.subscribers[json]) store.subscribers[json] = 0
    store.subscribers[json] += 1
    if (store.subscribers[json] === 1) {
      var action = Object.assign({ type: 'logux/subscribe' }, subscription)
      store.subscriptions[json] = store.dispatch.sync(action)
    }
    return store.subscriptions[json]
  }))
}

function remove (store, subscriptions) {
  subscriptions.forEach(function (i) {
    var subscription = i[0]
    var json = i[1]
    store.subscribers[json] -= 1
    if (store.subscribers[json] === 0) {
      var action = Object.assign({ type: 'logux/unsubscribe' }, subscription)
      store.log.add(action, { sync: true })
      delete store.subscriptions[json]
    }
  })
}

function useSubscription (channels, opts) {
  if (!opts) opts = { }

  var isSubscribing = useState(true)
  var store = useContext(opts.context || ReactReduxContext).store

  var subscriptions = channels.map(function (i) {
    var subscription = typeof i === 'string' ? { channel: i } : i
    return [subscription, JSON.stringify(subscription)]
  })

  var id = subscriptions.map(function (i) {
    return i[1]
  }).sort().join(' ')

  useEffect(function () {
    var updated = false
    add(store, subscriptions).then(function () {
      if (!updated) isSubscribing[1](false)
    })
    return function () {
      updated = true
      remove(store, subscriptions)
    }
  }, [id])

  return isSubscribing[0]
}

module.exports = useSubscription
