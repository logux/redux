var React = require('react')

function merge (to, from) {
  for (var i in from) to[i] = from[i]
  return to
}

function isInclude (subscriptions, subscription) {
  return subscriptions.some(function (i) {
    return i[1] === subscription[1]
  })
}

function getSubscriptions (subscriber, props) {
  var subscriptions = subscriber(props)
  if (!Array.isArray(subscriptions)) {
    subscriptions = [subscriptions]
  }
  return subscriptions.map(function (subscription) {
    if (typeof subscription === 'string') {
      subscription = { channel: subscription }
    }
    return [subscription, JSON.stringify(subscription)]
  })
}

function add (store, subscription, json) {
  if (!store.subscribers) store.subscribers = { }
  var subscribers = store.subscribers
  if (!subscribers[json]) subscribers[json] = 0

  if (subscribers[json] === 0) {
    var action = merge({ type: 'logux/subscribe' }, subscription)
    store.log.add(action, { sync: true })
  }
  subscribers[json] += 1
}

function remove (store, subscription, json) {
  store.subscribers[json] -= 1
  if (store.subscribers[json] === 0) {
    var action = merge({ type: 'logux/unsubscribe' }, subscription)
    store.log.add(action, { sync: true })
  }
}

/**
 * Decorator to add subscribe action on component mount and unsubscribe
 * on unmount.
 *
 * @param {subscriber} subscriber Callback to return subscribe action
 *                                properties according to component props.
 * @param {object} [options] Redux options.
 * @param {string} [options.storeKey] The store key name in context.
 *
 * @return {function} Class wrapper.
 *
 * @example
 * const subscribe = require('react-logux/subscribe')
 * @subscribe(({ id }) => `user/${ id }')
 * class User extends React.Component { … }
 *
 * @example
 * const subscribe = require('react-logux/subscribe')
 * class User extends React.Component { … }
 * const SubscribeUser = subscribe(props => {
 *   return { channel: `user/${ props.id }`, fields: ['name'] }
 * })(User)
 */
function subscribe (subscriber, options) {
  var storeKey = 'store'
  if (options && options.storeKey) storeKey = options.storeKey

  return function (Wrapped) {
    var wrappedName = Wrapped.displayName || Wrapped.name || 'Component'

    function SubscribeComponent () {
      React.Component.apply(this, arguments)
    }

    SubscribeComponent.displayName = 'Subscribe' + wrappedName

    SubscribeComponent.contextTypes = { }
    SubscribeComponent.contextTypes[storeKey] = function () { }

    SubscribeComponent.prototype = Object.create(React.Component.prototype, {
      constructor: SubscribeComponent
    })
    Object.setPrototypeOf(SubscribeComponent, React.Component)

    SubscribeComponent.prototype.componentWillMount = function () {
      this.subscriptions = getSubscriptions(subscriber, this.props)

      var store = this.context[storeKey]
      this.subscriptions.forEach(function (i) {
        add(store, i[0], i[1])
      })
    }

    SubscribeComponent.prototype.componentWillReceiveProps = function (props) {
      var store = this.context[storeKey]
      var prev = this.subscriptions
      var next = getSubscriptions(subscriber, props)

      prev.forEach(function (i) {
        if (!isInclude(next, i)) {
          remove(store, i[0], i[1])
        }
      })

      next.forEach(function (i) {
        if (!isInclude(prev, i)) {
          add(store, i[0], i[1])
        }
      })

      this.subscriptions = next
    }

    SubscribeComponent.prototype.componentWillUnmount = function () {
      var store = this.context[storeKey]
      this.subscriptions.forEach(function (i) {
        remove(store, i[0], i[1])
      })
    }

    SubscribeComponent.prototype.render = function () {
      return React.createElement(Wrapped, this.props)
    }

    return SubscribeComponent
  }
}

module.exports = subscribe

/**
 * @callback subscriber
 * @param {object} props The component properties.
 * @return {string|Subscription} The subscription action properties.
 */

/**
 * Details for subscription action.
 * @typedef {object} Subscription
 * @property {string} channel The channel name.
 */
