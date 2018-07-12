var React = require('react')

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

function add (store, subscriptions) {
  if (!store.subscriptions) store.subscriptions = { }
  if (!store.subscribers) store.subscribers = { }

  subscriptions.forEach(function (i) {
    var subscription = i[0]
    var json = i[1]
    if (!store.subscribers[json]) store.subscribers[json] = 0
    store.subscribers[json] += 1
    if (store.subscribers[json] === 1) {
      var action = Object.assign({ type: 'logux/subscribe' }, subscription)
      store.subscriptions[json] = store.dispatch.sync(action).then(function () {
        delete store.subscriptions[json]
      })
    }
  })
}

function remove (store, subscriptions) {
  subscriptions.forEach(function (i) {
    var subscription = i[0]
    var json = i[1]
    store.subscribers[json] -= 1
    if (store.subscribers[json] === 0) {
      var action = Object.assign({ type: 'logux/unsubscribe' }, subscription)
      store.log.add(action, { sync: true })
    }
  })
}

/**
 * Decorator to add subscribe action on component mount and unsubscribe
 * on unmount.
 *
 * @param {subscriber} subscriber Callback to return subscribe action
 *                                properties according to component props.
 * @param {object} [options] Redux options.
 * @param {string} [options.storeKey='store'] The store key name in context.
 * @param {string} [options.subscribingProp='isSubscribing'] Change default
 *                                                          `isSubscribing`
 *                                                           property.
 *
 * @return {function} Class wrapper.
 *
 * @example
 * const subscribe = require('logux-redux/subscribe')
 * @subscribe(({ id }) => `user/${ id }')
 * class User extends React.Component { … }
 *
 * @example
 * const subscribe = require('logux-redux/subscribe')
 * class User extends React.Component { … }
 * const SubscribeUser = subscribe(props => {
 *   return { channel: `user/${ props.id }`, fields: ['name'] }
 * })(User)
 */
function subscribe (subscriber, options) {
  var storeKey = 'store'
  if (options && options.storeKey) {
    storeKey = options.storeKey
  }

  var subscribingProp = 'isSubscribing'
  if (options && options.subscribingProp) {
    subscribingProp = options.subscribingProp
  }

  return function (Wrapped) {
    var wrappedName = Wrapped.displayName || Wrapped.name || 'Component'

    function SubscribeComponent () {
      React.Component.apply(this, arguments)
      this.last = 0
      this.state = { process: true }
    }

    SubscribeComponent.displayName = 'Subscribe' + wrappedName

    SubscribeComponent.contextTypes = { }
    SubscribeComponent.contextTypes[storeKey] = function () { }

    SubscribeComponent.prototype = Object.create(React.Component.prototype, {
      constructor: SubscribeComponent
    })
    Object.setPrototypeOf(SubscribeComponent, React.Component)

    SubscribeComponent.prototype.componentDidMount = function () {
      var store = this.context[storeKey]
      this.subscriptions = getSubscriptions(subscriber, this.props)
      add(store, this.subscriptions)
      this.wait(store)
    }

    SubscribeComponent.prototype.componentDidUpdate = function (prevProps) {
      if (prevProps === this.props) return

      var store = this.context[storeKey]
      var prev = this.subscriptions
      var next = getSubscriptions(subscriber, this.props)

      remove(store, prev.filter(function (i) {
        return !isInclude(next, i)
      }))

      var diff = next.filter(function (i) {
        return !isInclude(prev, i)
      })

      this.subscriptions = next
      if (diff.length > 0) {
        this.setState({ process: true })
        add(store, diff)
        this.wait(store)
      }
    }

    SubscribeComponent.prototype.componentWillUnmount = function () {
      remove(this.context[storeKey], this.subscriptions)
      this.last += 1
    }

    SubscribeComponent.prototype.wait = function (store) {
      var request = ++this.last
      var self = this
      Promise.all(this.subscriptions.map(function (i) {
        return store.subscriptions[i[1]]
      })).then(function () {
        if (self.last === request) {
          self.setState({ process: false })
        }
      })
    }

    SubscribeComponent.prototype.render = function () {
      var props = Object.assign({ }, this.props)
      props[subscribingProp] = this.state.process
      return React.createElement(Wrapped, props)
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
