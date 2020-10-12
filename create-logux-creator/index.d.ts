import {
  AnyAction,
  Action,
  Reducer,
  Observable,
  StoreEnhancer,
  PreloadedState,
  Store as ReduxStore
} from 'redux'
import {
  Client,
  ClientMeta,
  ClientOptions,
  CrossTabClient
} from '@logux/client'
import { Unsubscribe } from 'nanoevents'
import { Log } from '@logux/core'

export interface LoguxDispatch<A extends Action> {
  <T extends A>(action: T): T

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
  sync<T extends A>(action: T, meta?: Partial<ClientMeta>): Promise<ClientMeta>

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
  crossTab<T extends A>(
    action: T,
    meta?: Partial<ClientMeta>
  ): Promise<ClientMeta>

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
  local<T extends A>(action: T, meta?: Partial<ClientMeta>): Promise<ClientMeta>
}

export interface ReduxStateListener<S, A extends Action> {
  (state: S, prevState: S, action: A, meta: ClientMeta): void
}

export class LoguxReduxStore<
  S = any,
  A extends Action = AnyAction,
  L extends Log = Log<ClientMeta>,
  C extends Client = Client<{}, L>
> implements ReduxStore<S, A> {
  /**
   * Logux synchronization client.
   */
  client: C

  /**
   * The Logux log.
   */
  log: L

  /**
   * Promise until loading the state from IndexedDB.
   */
  initialize: Promise<void>

  /**
   * Add action to log with Redux compatible API.
   */
  dispatch: LoguxDispatch<A>

  /**
   * Subscribe for store events. Supported events:
   *
   * * `change`: when store was changed by action.
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
  on (event: 'change', listener: ReduxStateListener<S, A>): Unsubscribe

  /**
   * Reads the state tree managed by the store.
   *
   * @returns The current state tree of your application.
   */
  getState (): S

  /**
   * Adds a change listener.
   *
   * @param listener A callback to be invoked on every dispatch.
   * @returns A function to remove this change listener.
   */
  subscribe (listener: () => void): Unsubscribe

  /**
   * Replaces the reducer currently used by the store to calculate the state.
   *
   * @param nextReducer The reducer for the store to use instead.
   */
  replaceReducer (nextReducer: Reducer<S, A>): void

  [Symbol.observable] (): Observable<S>
}

export interface LoguxStoreCreator<
  L extends Log = Log<ClientMeta>,
  C extends Client = Client<{}, L>
> {
  <S, A extends Action = Action, Ext = {}, StateExt = {}>(
    reducer: Reducer<S, A>,
    enhancer?: StoreEnhancer<Ext, StateExt>
  ): LoguxReduxStore<S & StateExt, A, L, C> & Ext
  <S, A extends Action = Action, Ext = {}, StateExt = {}>(
    reducer: Reducer<S, A>,
    preloadedState?: PreloadedState<S>,
    enhancer?: StoreEnhancer<Ext>
  ): LoguxReduxStore<S & StateExt, A, L, C> & Ext
}

export type LoguxReduxOptions = {
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
  onMissedHistory?: (action: Action) => void

  /**
   * How often we need to clean log from old actions. Default is every `25`
   * actions.
   */
  cleanEvery?: number
}

/**
 * Connects Logux Client to Redux createStore function.
 *
 * ```js
 * import { CrossTabClient, createStoreCreator } from '@logux/redux'
 *
 * const client = new CrossTabClient({
 *   subprotocol: '1.0.0',
 *   server: process.env.NODE_ENV === 'development'
 *     ? 'ws://localhost:31337'
 *     : 'wss://logux.example.com',
 *   userId: userId.content
 *   token: token.content
 * })
 *
 * const createStore = createStoreCreator(client)
 *
 * const store = createStore(reducer)
 * store.client.start()
 * ```
 *
 * @param client Logux Client.
 * @param options Logux Redux options.
 * @returns Redux’s `createStore` compatible function.
 */
export function createStoreCreator<
  L extends Log = Log<ClientMeta>,
  C extends Client = Client<{}, L>
> (client: C, options?: LoguxReduxOptions): LoguxStoreCreator<L, C>

export function createLoguxCreator<
  H extends object = {},
  L extends Log = Log<ClientMeta>
> (
  config: ClientOptions & LoguxReduxOptions
): LoguxStoreCreator<L, CrossTabClient<H, L>>
