import { ComponentType, Context as ReduxContext } from 'react'

import { LoguxReduxStore } from '../create-store-creator/index.js'
import { Channel } from '../use-subscription/index.js'

interface Subscriber<P> {
  (props: P): Channel[] | Channel
}

type WrappedComponent<P> = ComponentType<P> & {
  WrappedComponent: ComponentType
}

interface Wrapper<P> {
  (component: ComponentType<{ isSubscribing: boolean } & P>): WrappedComponent<
    P
  >
}

type SubscribeOptions = {
  /**
   * Context with the store.
   */
  context?: ReduxContext<{ store: LoguxReduxStore }>

  /**
   * Change default `isSubscribing` property.
   */
  subscribingProp?: string
}

/**
 * Decorator to add subscribe action on component mount and unsubscribe
 * on unmount.
 *
 * ```js
 * import subscribe from '@logux/redux'
 * class User extends React.Component { … }
 * export default subscribe(({ id }) => `user/${ id }`)(User)
 * ```
 *
 * ```js
 * import subscribe from '@logux/redux'
 * class User extends React.Component { … }
 * const SubscribeUser = subscribe(props => {
 *   return { channel: `user/${ props.id }`, fields: ['name'] }
 * })(User)
 * ```
 *
 * @param subscriber Callback to return subscribe action properties according
 *                   to component props.
 * @param opts Options.
 *
 * @return Class wrapper.
 */
export function subscribe<P = object> (
  subscriber: Subscriber<P> | Channel[] | Channel,
  opts?: SubscribeOptions
): Wrapper<P>
