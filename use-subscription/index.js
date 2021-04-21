import { useContext, useEffect, useState } from 'react'
import { ReactReduxContext } from 'react-redux'

function add(store, subscriptions) {
  if (!store.subscriptions) store.subscriptions = {}
  if (!store.subscribers) store.subscribers = {}

  return Promise.all(
    subscriptions.map(i => {
      let subscription = i[0]
      let json = i[1]
      if (!store.subscribers[json]) store.subscribers[json] = 0
      store.subscribers[json] += 1
      if (store.subscribers[json] === 1) {
        let action = { ...subscription, type: 'logux/subscribe' }
        store.subscriptions[json] = store.dispatch.sync(action)
      }
      return store.subscriptions[json]
    })
  )
}

function remove(store, subscriptions) {
  subscriptions.forEach(i => {
    let subscription = i[0]
    let json = i[1]
    store.subscribers[json] -= 1
    if (store.subscribers[json] === 0) {
      let action = { ...subscription, type: 'logux/unsubscribe' }
      store.log.add(action, { sync: true })
      delete store.subscriptions[json]
    }
  })
}

export function useSubscription(channels, opts = {}) {
  let debounce = opts.debounce || 0
  let [isSubscribing, changeSubscribing] = useState(true)
  let { store } = useContext(opts.context || ReactReduxContext)

  let subscriptions = channels.map(i => {
    let subscription = typeof i === 'string' ? { channel: i } : i
    return [subscription, JSON.stringify(subscription)]
  })

  let id = subscriptions
    .map(i => i[1])
    .sort()
    .join(' ')

  useEffect(() => {
    let timeout
    let ignoreResponce = false

    function resetTimeout() {
      clearTimeout(timeout)
      timeout = null
    }

    if (debounce > 0) {
      timeout = setTimeout(() => {
        changeSubscribing(true)
      }, debounce)
    } else {
      changeSubscribing(true)
    }

    add(store, subscriptions).then(() => {
      if (timeout) resetTimeout()
      if (!ignoreResponce) changeSubscribing(false)
    })
    return () => {
      ignoreResponce = true
      remove(store, subscriptions)
      if (timeout) resetTimeout()
    }
  }, [id])

  return isSubscribing
}
