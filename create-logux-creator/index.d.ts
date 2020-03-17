import {
  AnyAction,
  Action,
  Reducer,
  StoreEnhancer,
  PreloadedState,
  Store
} from 'redux'
import { ClientOptions, ClientMeta, CrossTabClient } from '@logux/client'
import { Unsubscribe } from 'nanoevents'
import { Log } from '@logux/core'

export interface LoguxDispatch<A extends Action = AnyAction> {
  <T extends A>(action: T, ...extraArgs: any[]): T

  /**
   * Add sync action to log and update store state.
   * This action will be visible only for server and all browser tabs.
   *
   * ```js
   * store.dispatch.sync(
   *   { type: 'CHANGE_NAME', name },
   *   { reasons: ['lastName'] }
   * ).then(meta => {
   *   store.log.removeReason('lastName', { maxAdded: meta.added - 1 })
   * })
   * ```
   *
   * @param action The new action.
   * @param meta Action’s metadata.
   * @returns Promise when action will be processed by the server.
   */
  sync <T extends A>(
    action: T, meta?: Partial<ClientMeta>
  ): Promise<ClientMeta>

  /**
   * Add cross-tab action to log and update store state.
   * This action will be visible only for all tabs.
   *
   * ```js
   * store.dispatch.crossTab(
   *   { type: 'CHANGE_FAVICON', favicon },
   *   { reasons: ['lastFavicon'] }
    * ).then(meta => {
    *   store.log.removeReason('lastFavicon', { maxAdded: meta.added - 1 })
    * })
    * ```
   *
   * @param action The new action.
   * @param meta Action’s metadata.
   * @returns Promise when action will be saved to the log.
   */
  crossTab <T extends A>(
    action: T, meta?: Partial<ClientMeta>
  ):Promise<ClientMeta>

  /**
   * Add local action to log and update store state.
   * This action will be visible only for current tab.
   *
   * ```js
   *
   * store.dispatch.local(
   *   { type: 'OPEN_MENU' },
   *   { reasons: ['lastMenu'] }
   * ).then(meta => {
   *   store.log.removeReason('lastMenu', { maxAdded: meta.added - 1 })
   * })
   * ```
   *
   * @param action The new action.
   * @param meta Action’s metadata.
   * @returns Promise when action will be saved to the log.
   */
  local <T extends A>(
    action: T, meta?: Partial<ClientMeta>
  ): Promise<ClientMeta>

  /**
   * Logux synchronization client.
   */
  client: CrossTabClient

  /**
   * The Logux log.
   */
  log: Log<ClientMeta>
}

export interface stateListener<S, A> {
  (state: S, prevState: S, action: A, meta: ClientMeta): void
}

export interface LoguxStore<S = any, A extends Action = AnyAction> {
  /**
   * Add action to log with Redux compatible API.
   */
  dispatch: LoguxDispatch<A>

  /**
   * Subscribe for store events.
   *
   * ```js
   * store.on('change', (state, prevState, action, meta) => {
   *   console.log(state, prevState, action, meta)
   * })
   * ```
   *
   * @param event The event name.
   * @param listener The listener function.
   * @returns Unbind listener from event.
   */
  on (event: 'change', listener: stateListener<S, A>): Unsubscribe
}

export type ExtendState<State, Extension> = [Extension] extends [never]
  ? State
  : State & Extension

export interface LoguxStoreCreator {
  <S, A extends Action, Ext = {}, StateExt = {}>(
    reducer: Reducer<S, A>,
    enhancer?: StoreEnhancer<Ext, StateExt>
  ): LoguxStore<S & StateExt, A> & Store<S & StateExt, A> & Ext
  <S, A extends Action, Ext, StateExt>(
    reducer: Reducer<S, A>,
    preloadedState?: PreloadedState<S>,
    enhancer?: StoreEnhancer<Ext>
  ): LoguxStore<S & StateExt, A> & Store<S & StateExt, A> & Ext
}

type LoguxReduxConfig = ClientOptions & {
  /**
   * How many actions without `meta.reasons` will be kept for time travel.
   * Default is `1000`.
   */
  reasonlessHistory?: number

  /**
   * How often save state to history. Default is `50`.
   */
  saveStateEvery?: number

  /**
   * Callback when there is no history to replay actions accurate.
   */
  onMissedHistory?: (Action) => void
}


/**
 * Creates Logux client and connect it to Redux createStore function.
 *
 * ```js
 * import { createLoguxCreator } from '@logux/redux'
 *
 * const createStore = createLoguxCreator({
 *   subprotocol: '1.0.0',
 *   server: process.env.NODE_ENV === 'development'
 *     ? 'ws://localhost:31337'
 *     : 'wss://logux.example.com',
 *   userId: userId.content
 *   credentials: token.content
 * })
 *
 * const store = createStore(reducer)
 * store.client.start()
 * ```
 *
 * @param config Logux Client config.
 * @returns Redux’s `createStore` compatible function.
 */
export function createLoguxCreator(
  config: LoguxReduxConfig
): LoguxStoreCreator
