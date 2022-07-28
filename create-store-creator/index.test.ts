import {
  CrossTabClient,
  LoguxUndoError,
  ClientOptions,
  ClientMeta
} from '@logux/client'
import { applyMiddleware, Reducer, StoreEnhancer } from 'redux'
import { TestPair, TestTime, Action, TestLog } from '@logux/core'
import { spyOn, restoreAll, spy } from 'nanospy'
import { equal, is, ok, type } from 'uvu/assert'
import { LoguxUndoAction } from '@logux/actions'
import { delay } from 'nanodelay'
import { test } from 'uvu'

import {
  createStoreCreator,
  LoguxReduxOptions,
  LoguxReduxStore
} from '../index.js'

type State = {
  value: string
}

type AddAction = {
  type: 'ADD'
  value: string
}

function createStore(
  reducer: Reducer = history,
  opts: Partial<LoguxReduxOptions & ClientOptions> = {},
  enhancer: StoreEnhancer | undefined = undefined
): LoguxReduxStore<State, AddAction | LoguxUndoAction, TestLog<ClientMeta>> {
  let creatorOptions = {
    cleanEvery: opts.cleanEvery,
    saveStateEvery: opts.saveStateEvery,
    onMissedHistory: opts.onMissedHistory,
    reasonlessHistory: opts.reasonlessHistory
  }

  delete opts.cleanEvery
  delete opts.onMissedHistory
  delete opts.saveStateEvery
  delete opts.reasonlessHistory

  let client = new CrossTabClient<{}, TestLog<ClientMeta>>({
    server: 'wss://localhost:1337',
    subprotocol: '1.0.0',
    userId: '10',
    time: new TestTime(),
    ...opts
  })
  let creator = createStoreCreator<TestLog<ClientMeta>>(client, creatorOptions)
  let store = creator<State, AddAction | LoguxUndoAction>(
    reducer,
    { value: '0' },
    enhancer
  )

  return store
}

function isAdd(action: Action): action is AddAction {
  return action.type === 'ADD'
}

function history(state: State, action: Action): State {
  if (isAdd(action)) {
    return { value: `${state.value}${action.value}` }
  } else {
    return state
  }
}

function emit(obj: any, event: string, ...args: any[]): void {
  obj.emitter.emit(event, ...args)
}

const ADD_A: AddAction = { type: 'ADD', value: 'a' }

// @ts-ignore
global.WebSocket = () => {}

test.after.each(() => {
  restoreAll()
})

test('creates Redux store', () => {
  let store = createStore()
  store.dispatch(ADD_A)
  equal(store.getState(), { value: '0a' })
})

test('creates Logux client', () => {
  let store = createStore()
  equal(store.client.options.subprotocol, '1.0.0')
})

test('sets tab ID', async () => {
  let store = createStore()
  await new Promise<void>(resolve => {
    store.log.on('add', (action, meta) => {
      equal(meta.tab, store.client.tabId)
      equal(meta.reasons, [`timeTravelTab${store.client.tabId}`])
      resolve()
    })
    store.dispatch(ADD_A)
  })
})

test('has shortcut for add', async () => {
  let store = createStore()
  await store.dispatch.crossTab(ADD_A, { reasons: ['test'] })
  equal(store.getState(), { value: '0a' })
  equal(store.log.entries()[0][1].reasons, ['test'])
})

test('listen for action from other tabs', () => {
  let store = createStore()
  emit(store.client, 'add', ADD_A, { id: '1 t 0' })
  equal(store.getState(), { value: '0a' })
})

test('undoes last when snapshot exists', async () => {
  let store = createStore(undefined, { saveStateEvery: 1 })

  await store.dispatch.crossTab(ADD_A, {
    id: '57 106:test1 1',
    reasons: ['test']
  })
  await store.dispatch.crossTab(ADD_A, {
    id: '58 106:test1 1',
    reasons: ['test']
  })
  await store.dispatch.crossTab(
    {
      type: 'logux/undo',
      id: '58 106:test1 1',
      reason: 'test undo',
      action: { type: '???' }
    },
    {
      id: '59 106:test1 1',
      reasons: ['as requested']
    }
  )
  await delay(10)
  equal(store.getState(), { value: '0a' })
})

test('saves previous states', async () => {
  let calls = 0
  let store = createStore((state: State, action: Action) => {
    if (action.type === 'ADD') calls += 1
    return state
  })

  let promise: Promise<void | ClientMeta> = Promise.resolve()
  for (let i = 0; i < 60; i++) {
    if (i % 2 === 0) {
      promise = promise.then(() => {
        return store.dispatch.crossTab(ADD_A, { reasons: ['test'] })
      })
    } else {
      store.dispatch(ADD_A)
    }
  }
  await promise
  equal(calls, 60)
  calls = 0
  await store.dispatch.crossTab(ADD_A, {
    id: '57 10:test1 1',
    reasons: ['test']
  })
  await delay(10)
  equal(calls, 10)
})

test('changes history recording frequency', async () => {
  let calls = 0
  let store = createStore(
    (state: State, action: Action) => {
      if (action.type === 'ADD') calls += 1
      return state
    },
    {
      saveStateEvery: 1
    }
  )

  await Promise.all([
    store.dispatch.crossTab(ADD_A, { reasons: ['test'] }),
    store.dispatch.crossTab(ADD_A, { reasons: ['test'] }),
    store.dispatch.crossTab(ADD_A, { reasons: ['test'] }),
    store.dispatch.crossTab(ADD_A, { reasons: ['test'] })
  ])
  calls = 0
  await store.dispatch.crossTab(ADD_A, {
    id: '3 10:test1 1',
    reasons: ['test']
  })
  await delay(10)
  equal(calls, 2)
})

test('cleans its history on removing action', async () => {
  let calls = 0
  let store = createStore(
    (state: State, action: Action) => {
      if (action.type === 'ADD') calls += 1
      return state
    },
    {
      saveStateEvery: 2
    }
  )
  let nodeId = store.client.nodeId

  await Promise.all([
    store.dispatch.crossTab(ADD_A, { reasons: ['test'] }),
    store.dispatch.crossTab(ADD_A, { reasons: ['test'] }),
    store.dispatch.crossTab(ADD_A, { reasons: ['test'] }),
    store.dispatch.crossTab(ADD_A, { reasons: ['test'] }),
    store.dispatch.crossTab(ADD_A, { reasons: ['test'] }),
    store.dispatch.crossTab(ADD_A, { reasons: ['test'] })
  ])
  await store.log.changeMeta(`5 ${nodeId} 0`, { reasons: [] })
  calls = 0
  await store.dispatch.crossTab(ADD_A, {
    id: `5 ${nodeId} 1`,
    reasons: ['test']
  })
  await delay(10)
  equal(calls, 3)
})

test('changes history', async () => {
  let store = createStore()

  await Promise.all([
    store.dispatch.crossTab({ type: 'ADD', value: 'a' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'ADD', value: 'b' }, { reasons: ['test'] })
  ])
  store.dispatch({ type: 'ADD', value: 'c' })
  store.dispatch({ type: 'ADD', value: 'd' })
  await store.dispatch.crossTab(
    { type: 'ADD', value: '|' },
    { id: '2 10:test1 1', reasons: ['test'] }
  )
  await delay(10)
  equal(store.getState().value, '0ab|cd')
})

test('undoes actions', async () => {
  let store = createStore()
  let nodeId = store.client.nodeId

  await Promise.all([
    store.dispatch.crossTab({ type: 'ADD', value: 'a' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'ADD', value: 'b' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'ADD', value: 'c' }, { reasons: ['test'] })
  ])
  equal(store.getState().value, '0abc')
  store.dispatch.crossTab(
    {
      type: 'logux/undo',
      id: `2 ${nodeId} 0`,
      action: { type: 'ADD', value: 'b' },
      reason: 'error'
    },
    { reasons: ['test'] }
  )
  await delay(1)
  equal(store.getState().value, '0ac')
})

test('replaces reducer', async () => {
  let store = createStore()
  store.dispatch({ type: 'ADD', value: 'a' })
  store.dispatch({ type: 'ADD', value: 'b' })
  equal(store.getState().value, '0ab')

  store.replaceReducer(
    (state: State | undefined, action: AddAction | LoguxUndoAction): State => {
      if (isAdd(action) && typeof state !== 'undefined') {
        return { value: state.value + action.value.toUpperCase() }
      } else {
        return { value: '0' }
      }
    }
  )
  await store.dispatch.crossTab(
    { type: 'ADD', value: 'z' },
    { id: '1 10:test1 1', reasons: ['test'] }
  )
  await delay(10)
  equal(store.getState().value, '0aZB')
})

test('ignores cleaned history from non-legacy actions', async () => {
  let onMissedHistory = spy()
  let store = createStore(history, {
    onMissedHistory,
    saveStateEvery: 2
  })
  await Promise.all([
    store.dispatch.crossTab({ type: 'ADD', value: 'a' }, { reasons: ['one'] }),
    store.dispatch.crossTab({ type: 'ADD', value: 'b' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'ADD', value: 'c' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'ADD', value: 'd' }, { reasons: ['test'] })
  ])
  await store.log.removeReason('one')
  store.dispatch.crossTab(
    { type: 'ADD', value: '|' },
    { id: '1 10:test1 0', reasons: ['test'] }
  )
  await delay(1)
  equal(store.getState().value, '0|bcd')
  is(onMissedHistory.called, false)
})

test('does not replays actions on logux/ actions', async () => {
  let reduced: string[] = []
  let store = createStore((state, action) => {
    if (action.type.slice(0, 2) !== '@@') reduced.push(action.type)
    return state
  })
  store.log.add({ type: 'A' }, { reasons: ['t'] })
  store.log.add({ type: 'logux/processed' }, { time: 0 })
  store.log.add({ type: 'logux/subscribe' }, { sync: true, time: 0 })
  store.log.add({ type: 'logux/unsubscribe' }, { sync: true, time: 0 })
  store.log.add({ type: 'B' }, { reasons: ['t'], time: 0 })
  await delay(1)
  equal(reduced, ['A', 'B', 'A'])
  equal(store.log.actions(), [
    { type: 'logux/subscribe' },
    { type: 'logux/unsubscribe' },
    { type: 'B' },
    { type: 'A' }
  ])
})

test('replays history for reason-less action', async () => {
  let store = createStore()
  await Promise.all([
    store.dispatch.crossTab({ type: 'ADD', value: 'a' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'ADD', value: 'b' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'ADD', value: 'c' }, { reasons: ['test'] })
  ])
  store.dispatch.crossTab(
    { type: 'ADD', value: '|' },
    { id: '1 10:test1 1', noAutoReason: true }
  )
  await delay(1)
  equal(store.getState().value, '0a|bc')
  equal(store.log.entries().length, 3)
})

test('does not accidentally re-process actions that were part of the latest replay', async () => {
  let pair = new TestPair()
  let store = createStore(history, { server: pair.left })

  store.dispatch({ type: 'ADD', value: 'a' })
  store.dispatch({ type: 'ADD', value: 'b' })

  let localDispatch = store.dispatch.sync(
    { type: 'ADD', value: 'c' },
    { reasons: ['test'] }
  )
  // pair.left.emitter.emit('message', [
  //   'sync',
  //   { type: 'ADD', value: '|' },
  //   { reasons: ['test'] }
  // ])
  await localDispatch
  is(1, 2)
  // await delay(1)
  equal(store.getState().value, '0ab')
  // equal(store.getState().value, '0a|c')
  // equal(store.log.entries().length, 3)
})

test('replays actions before staring since initial state', async () => {
  let onMissedHistory = spy()
  let store = createStore(history, {
    onMissedHistory,
    saveStateEvery: 2
  })
  await Promise.all([
    store.dispatch.crossTab({ type: 'ADD', value: 'b' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'ADD', value: 'c' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'ADD', value: 'd' }, { reasons: ['test'] })
  ])
  store.dispatch.crossTab(
    { type: 'ADD', value: '|' },
    { id: '0 10:test1 0', reasons: ['test'] }
  )
  await delay(1)
  is(onMissedHistory.called, false)
  equal(store.getState().value, '0|bcd')
})

test('replays actions on missed history', async () => {
  let onMissedHistory = spy()
  let store = createStore(history, {
    reasonlessHistory: 2,
    onMissedHistory,
    saveStateEvery: 2,
    cleanEvery: 1
  })
  store.dispatch({ type: 'ADD', value: 'a' })
  store.dispatch({ type: 'ADD', value: 'b' })
  store.dispatch({ type: 'ADD', value: 'c' })
  store.dispatch({ type: 'ADD', value: 'd' })
  await delay(1)
  store.dispatch.crossTab(
    { type: 'ADD', value: '[' },
    { id: '0 10:test1 0', reasons: ['test'] }
  )
  await delay(1)
  equal(store.getState().value, '0abc[d')
  equal(onMissedHistory.calls, [[{ type: 'ADD', value: '[' }]])
  store.dispatch.crossTab(
    { type: 'ADD', value: ']' },
    { id: '0 10:test1 1', reasons: ['test'] }
  )
  await delay(1)
  equal(store.getState().value, '0abc[]d')
})

test('works without onMissedHistory', async () => {
  let store = createStore(history, {
    reasonlessHistory: 2,
    saveStateEvery: 2,
    cleanEvery: 1
  })
  store.dispatch({ type: 'ADD', value: 'a' })
  store.dispatch({ type: 'ADD', value: 'b' })
  store.dispatch({ type: 'ADD', value: 'c' })
  store.dispatch({ type: 'ADD', value: 'd' })
  await delay(1)
  await store.dispatch.crossTab(
    { type: 'ADD', value: '|' },
    { id: '0 10:test1 0', reasons: ['test'] }
  )
})

test('does not fall on missed onMissedHistory', async () => {
  let store = createStore(history)
  await store.dispatch.crossTab(
    { type: 'ADD', value: 'a' },
    { reasons: ['first'] }
  )
  await store.log.removeReason('first')
  store.dispatch.crossTab(
    { type: 'ADD', value: '|' },
    { id: '0 10:test1 0', reasons: ['test'] }
  )
  await delay(1)
  equal(store.getState().value, '0|')
})

test('cleans action added without reason', async () => {
  let store = createStore(history, { reasonlessHistory: 3 })

  store.dispatch.local({ type: 'ADD', value: '0' }, { reasons: ['test'] })
  equal(store.log.entries()[0][1].reasons, ['test'])

  function add(index: number) {
    return () => {
      store.dispatch({ type: 'ADD', value: `${4 * index - 3}` })
      store.dispatch.local({ type: 'ADD', value: `${4 * index - 2}` })
      store.dispatch.crossTab({ type: 'ADD', value: `${4 * index - 1}` })
      store.dispatch.sync({ type: 'ADD', value: `${4 * index}` })
    }
  }

  let promise = Promise.resolve()
  for (let i = 1; i <= 6; i++) {
    promise = promise.then(add(i))
  }

  await promise
  await delay(1)

  let entries = store.log.entries()
  let last = entries[entries.length - 1]
  equal(last[1].reasons, ['syncing', 'timeTravel'])
  store.dispatch({ type: 'ADD', value: '25' })
  await store.log.removeReason('syncing')
  await delay(1)
  equal(store.log.actions(), [
    { type: 'ADD', value: '0' },
    { type: 'ADD', value: '23' },
    { type: 'ADD', value: '24' },
    { type: 'ADD', value: '25' }
  ])
})

test('cleans last 1000 by default', async () => {
  let store = createStore()

  let promise = Promise.resolve()
  for (let i = 0; i < 1050; i++) {
    promise = promise.then(() => {
      store.dispatch(ADD_A)
    })
  }

  await promise
  await delay(1)
  equal(store.log.actions().length, 1000)
})

test('copies reasons to undo action', async () => {
  let store = createStore()
  let nodeId = store.client.nodeId
  await store.dispatch.crossTab(ADD_A, { reasons: ['a', 'b'] })
  await store.dispatch.crossTab(
    { type: 'logux/undo', id: `1 ${nodeId} 0`, action: ADD_A, reason: 'error' },
    { reasons: [] }
  )
  let result = await store.log.byId(`2 ${nodeId} 0`)
  if (result[0] === null) throw new Error('Action was not found')
  equal(result[0].type, 'logux/undo')
  equal(result[1].reasons, ['a', 'b'])
})

test('dispatches local actions', async () => {
  let store = createStore()
  await store.dispatch.local(ADD_A, { reasons: ['test'] })
  equal(store.log.entries()[0][0], ADD_A)
  equal(store.log.entries()[0][1].tab, store.client.tabId)
  equal(store.log.entries()[0][1].reasons, ['test'])
})

test('allows to miss meta for local actions', async () => {
  let store = createStore()
  store.log.on('preadd', (action, meta) => {
    meta.reasons.push('preadd')
  })
  await store.dispatch.local(ADD_A)
  equal(store.log.entries()[0][0], ADD_A)
})

test('dispatches sync actions', async () => {
  let store = createStore()
  store.dispatch.sync(ADD_A, { reasons: ['test'] })
  await delay(1)
  let log = store.log.entries()
  equal(log[0][0], ADD_A)
  is(log[0][1].sync, true)
  equal(log[0][1].reasons, ['test', 'syncing'])
})

test('cleans sync action after processing', async () => {
  let warn = spyOn(console, 'warn', () => {})
  let pair = new TestPair()
  let store = createStore(history, { server: pair.left })
  let resultA, resultB

  store.dispatch
    .sync({ type: 'ADD', value: 'a' })
    .then(() => {
      resultA = 'processed'
    })
    .catch((e: LoguxUndoError) => {
      ok(e.message.includes('undid'))
      ok(e.message.includes('because of error'))
      resultA = e.action.reason
    })
  store.dispatch
    .sync({ type: 'ADD', value: 'b' }, { id: '3 10:1:1 0' })
    .then(() => {
      resultB = 'processed'
    })
    .catch(e => {
      ok(e.message.includes('undid'))
      ok(e.message.includes('because of error'))
      resultB = e.action.reason
    })

  store.log.removeReason('timeTravel')
  await store.log.add({ type: 'logux/processed', id: '0 10:1:1 0' })
  is(resultA, undefined)
  is(resultB, undefined)
  equal(store.log.actions(), [
    { type: 'ADD', value: 'a' },
    { type: 'ADD', value: 'b' }
  ])
  await store.log.add({ type: 'logux/processed', id: '1 10:1:1 0' })
  equal(resultA, 'processed')
  is(resultB, undefined)
  equal(store.log.actions(), [{ type: 'ADD', value: 'b' }])
  store.log.add({ type: 'logux/undo', reason: 'error', id: '3 10:1:1 0' })
  await delay(1)
  equal(resultB, 'error')
  equal(store.log.actions(), [])
  is(warn.called, false)
})

test('applies old actions from store', async () => {
  let store1 = createStore(history, { reasonlessHistory: 2 })
  let store2
  await Promise.all([
    store1.dispatch.crossTab(
      { type: 'ADD', value: '1' },
      { id: '0 10:x 1', reasons: ['test'] }
    ),
    store1.dispatch.crossTab(
      { type: 'ADD', value: '2' },
      { id: '0 10:x 2', reasons: ['test'] }
    ),
    store1.dispatch.crossTab(
      { type: 'ADD', value: '3' },
      { id: '0 10:x 3', reasons: ['test'] }
    ),
    store1.dispatch.crossTab(
      { type: 'ADD', value: '4' },
      { id: '0 10:x 4', reasons: ['test'] }
    ),
    store1.log.add(
      { type: 'ADD', value: '5' },
      { id: '0 10:x 5', reasons: ['test'], tab: 'test2' }
    ),
    store1.dispatch.crossTab(
      {
        type: 'logux/undo',
        id: '0 10:x 2',
        action: { type: 'ADD', value: '2' },
        reason: 'error'
      },
      { id: '0 10:x 6', reasons: ['test'] }
    )
  ])
  store2 = createStore(history, { store: store1.log.store })

  store2.dispatch({ type: 'ADD', value: 'a' })
  store2.dispatch({ type: 'ADD', value: 'b' })
  store2.dispatch.crossTab({ type: 'ADD', value: 'c' }, { reasons: ['test'] })
  store2.dispatch({ type: 'ADD', value: 'd' })
  store2.dispatch({ type: 'ADD', value: 'e' })
  equal(store2.getState().value, '0abde')

  await store2.initialize
  equal(store2.getState().value, '0134abcde')
})

test('supports middlewares', () => {
  let store = createStore(
    history,
    {},
    applyMiddleware(() => {
      return dispatch => {
        return action => {
          if (action.value !== 'a') {
            dispatch(action)
          }
        }
      }
    })
  )

  store.dispatch({ type: 'ADD', value: 'a' })
  store.dispatch({ type: 'ADD', value: 'b' })
  equal(store.getState().value, '0b')
})

test('waits for replaying', async () => {
  let store = createStore(history)
  let run: undefined | (() => void)
  let waiting = new Promise<void>(resolve => {
    run = resolve
  })

  let first = true
  let originEach = store.log.each
  store.log.each = async function (...args: any) {
    let result = originEach.apply(this, args)
    if (first) {
      first = false
      await waiting
    }
    return result
  }

  await store.dispatch.crossTab({ type: 'ADD', value: 'b' }, { reasons: ['t'] })
  await store.dispatch.crossTab(
    { type: 'ADD', value: 'a' },
    { id: '0 test 0', reasons: ['t'] }
  )
  await Promise.all([
    store.dispatch.crossTab({ type: 'ADD', value: 'c' }, { reasons: ['o'] }),
    store.dispatch.crossTab({ type: 'ADD', value: 'd' }, { reasons: ['t'] })
  ])
  delay(1)
  equal(store.getState().value, '0b')
  store.log.removeReason('o')
  if (typeof run === 'undefined') throw new Error('run was not set')
  run()
  await delay(10)
  equal(store.getState().value, '0abd')
})

test('emits change event', async () => {
  let store = createStore(history)

  store.log.on('preadd', (action, meta) => {
    meta.reasons.push('test')
  })

  let calls: [State, State, Action][] = []
  store.on('change', (state, prevState, action, meta) => {
    type(meta.id, 'string')
    calls.push([state, prevState, action])
  })

  store.dispatch({ type: 'ADD', value: 'a' })
  store.dispatch.local({ type: 'ADD', value: 'c' })
  store.dispatch.local({ type: 'ADD', value: 'b' }, { id: '1 10:test1 1' })
  await delay(10)
  equal(calls, [
    [{ value: '0a' }, { value: '0' }, { type: 'ADD', value: 'a' }],
    [{ value: '0ac' }, { value: '0a' }, { type: 'ADD', value: 'c' }],
    [{ value: '0abc' }, { value: '0ac' }, { type: 'ADD', value: 'b' }]
  ])
})

test('warns about undoes cleaned action', async () => {
  let store = createStore(history)
  await store.dispatch.crossTab({
    type: 'logux/undo',
    id: '1 t 0',
    action: { type: 'ADD' },
    reason: 'error'
  })
  await delay(10)
  equal(store.log.actions().length, 0)
})

test('does not put reason on request', async () => {
  let store = createStore(history)
  await store.dispatch.crossTab(
    { type: 'ADD', value: 'A' },
    { noAutoReason: true }
  )
  await store.dispatch.crossTab({ type: 'ADD', value: 'B' })
  equal(store.log.actions(), [{ type: 'ADD', value: 'B' }])

  await store.dispatch.crossTab({ type: 'ADD', value: 'a' }, { reasons: ['a'] })
  await store.dispatch.crossTab({ type: 'ADD', value: 'b' }, { keepLast: 'b' })
  equal(store.log.actions(), [
    { type: 'ADD', value: 'B' },
    { type: 'ADD', value: 'a' },
    { type: 'ADD', value: 'b' }
  ])
  is(store.log.entries()[1][1].noAutoReason, true)
  is(store.log.entries()[2][1].noAutoReason, true)
})

test.run()
