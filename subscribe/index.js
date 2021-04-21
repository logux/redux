import { createElement } from 'react'

import { useSubscription } from '../use-subscription/index.js'

export function subscribe(subscriber, opts = {}) {
  let subscribingProp = 'isSubscribing'
  if (opts.subscribingProp) subscribingProp = opts.subscribingProp

  return function (Wrapped) {
    function SubscribeComponent(ownProps) {
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
