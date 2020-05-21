import { Context as ReduxContext } from 'react'

import { LoguxReduxStore } from '../create-logux-creator'

type SubscribingOptions = {
  /**
   * Context with the store.
   */
  context?: ReduxContext<{ store: LoguxReduxStore }>
}

export type Channel =
  | string
  | {
      channel: string
      [extra: string]: any
    }

/**
 * Hook to subscribe for channel during component render and unsubscribe
 * on component unmount.
 *
 * ```js
 * import useSubscription from '@logux/redux'
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
 * ```
 *
 * @param channels Channels to subscribe.
 * @param opts Options
 * @return `true` during data loading.
 */
export function useSubscription (
  channels: Channel[],
  opts?: SubscribingOptions
): boolean
