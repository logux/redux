let { useContext, useEffect, useState } = require('react')
let { ReactReduxContext } = require('react-redux')

function add (store, subscriptions) {
  if (!store.subscriptions) store.subscriptions = { }
  if (!store.subscribers) store.subscribers = { }

  return Promise.all(subscriptions.map(i => {
    let subscription = i[0]
    let json = i[1]
    if (!store.subscribers[json]) store.subscribers[json] = 0
    store.subscribers[json] += 1
    if (store.subscribers[json] === 1) {
      let action = { ...subscription, type: 'logux/subscribe' }
      store.subscriptions[json] = store.dispatch.sync(action)
    }
    return store.subscriptions[json]
  }))
}

function remove (store, subscriptions) {
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

/**
 * @typedef {object} SubscribeAction
 * @property {string} channel
 */

/**
 * @typedef {string|SubscribeAction} Channel
 */

/**
 * Hook to subscribe for channel during component render and unsubscribe
 * on component unmount.
 *
 * @param  {Channel[]} channels Channels to subscribe.
 * @param  {object}  [opts={}] Options.
 * @param  {Context} [opts.context] Context with the store.
 * @return {boolean} `true` during data loading.
 *
 * @example
 * import useSubscription from '@logux/redux/use-subscription'
 * import { useSelector } from 'react-redux'
 *
 * const UserPage = ({ userId }) => {
 *   const isSubscribing = useSubscription([`user/${ userId }`])
 *   const user = useSelector(state => state.users.find(i => i.id === userId))
 *   if (isSubscribing) {
 *     return <Loader />
 *   } else {
 *     return <h1>{ user.name }</h1>
 *   }
 * }
 */
function useSubscription (channels, opts = { }) {
  let [isSubscribing, changeSubscribing] = useState(true)
  let { store } = useContext(opts.context || ReactReduxContext)

  let subscriptions = channels.map(i => {
    let subscription = typeof i === 'string' ? { channel: i } : i
    return [subscription, JSON.stringify(subscription)]
  })

  let id = subscriptions.map(i => i[1]).sort().join(' ')

  useEffect(() => {
    let updated = false
    add(store, subscriptions).then(() => {
      if (!updated) changeSubscribing(false)
    })
    return () => {
      updated = true
      remove(store, subscriptions)
    }
  }, [id])

  return isSubscribing
}

module.exports = { useSubscription }
