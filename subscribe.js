var React = require('react')

function merge (to, from) {
  for (var i in from) to[i] = from[i]
  return to
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
      this.subscribe(this.props)
    }

    SubscribeComponent.prototype.componentWillReceiveProps = function (props) {
      this.unsubscribe()
      this.subscribe(props)
    }

    SubscribeComponent.prototype.componentWillUnmount = function () {
      this.unsubscribe()
    }

    SubscribeComponent.prototype.subscribe = function (props) {
      this.properties = subscriber(props)
      if (typeof this.properties === 'string') {
        this.properties = { channel: this.properties }
      }
      this.json = JSON.stringify(props)

      var store = this.context[storeKey]

      if (!store.subscribers) store.subscribers = { }
      if (!store.subscribers[this.json]) store.subscribers[this.json] = 0

      if (store.subscribers[this.json] === 0) {
        var action = merge({ type: 'logux/subscribe' }, this.properties)
        store.log.add(action, { sync: true })
      }
      store.subscribers[this.json] += 1
    }

    SubscribeComponent.prototype.unsubscribe = function () {
      var store = this.context[storeKey]

      store.subscribers[this.json] -= 1

      if (store.subscribers[this.json] === 0) {
        var action = merge({ type: 'logux/unsubscribe' }, this.properties)
        store.log.add(action, { sync: true })
      }
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
