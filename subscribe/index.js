let { createElement } = require('react')

let { useSubscription } = require('../use-subscription')

function subscribe (subscriber, opts = {}) {
  let subscribingProp = 'isSubscribing'
  if (opts.subscribingProp) subscribingProp = opts.subscribingProp

  return function (Wrapped) {
    function SubscribeComponent (ownProps) {
      let channels = subscriber
      if (typeof subscriber === 'function') channels = subscriber(ownProps)
      if (!Array.isArray(channels)) channels = [channels]
      let isSubscribing = useSubscription(channels, opts)
      let props = { ...ownProps }
      props[subscribingProp] = isSubscribing
      return createElement(Wrapped, props)
    }
    SubscribeComponent.WrappedComponent = Wrapped
    return SubscribeComponent
  }
}

module.exports = { subscribe }

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
