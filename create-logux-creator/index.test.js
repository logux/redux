let { TestPair, TestTime } = require('@logux/core')
let { applyMiddleware } = require('redux')
let { delay } = require('nanodelay')

let { createLoguxCreator } = require('..')

function createStore (reducer, opts = {}, enhancer) {
  if (!opts.server) opts.server = 'wss://localhost:1337'
  opts.subprotocol = '1.0.0'
  opts.userId = '10'
  opts.time = new TestTime()

  let creator = createLoguxCreator(opts)
  let store = creator(reducer, { value: 0 }, enhancer)

  return store
}

function increment (state, action) {
  if (action.type === 'INC') {
    return { value: state.value + 1 }
  } else {
    return state
  }
}

function historyLine (state, action) {
  if (action.type === 'ADD') {
    return { value: state.value + action.value }
  } else {
    return state
  }
}

it('throws error on missed config', () => {
  expect(() => {
    createLoguxCreator()
  }).toThrow('Missed server option in Logux client')
})

it('creates Redux store', () => {
  let store = createStore(increment)
  store.dispatch({ type: 'INC' })
  expect(store.getState()).toEqual({ value: 1 })
})

it('creates Logux client', () => {
  let store = createStore(increment)
  expect(store.client.options.subprotocol).toEqual('1.0.0')
})

it('sets tab ID', async () => {
  let store = createStore(increment)
  await new Promise(resolve => {
    store.log.on('add', (action, meta) => {
      expect(meta.tab).toEqual(store.client.tabId)
      expect(meta.reasons).toEqual([`timeTravelTab${store.client.tabId}`])
      resolve()
    })
    store.dispatch({ type: 'INC' })
  })
})

it('has shortcut for add', async () => {
  let store = createStore(increment)
  await store.dispatch.crossTab({ type: 'INC' }, { reasons: ['test'] })
  expect(store.getState()).toEqual({ value: 1 })
  expect(store.log.store.created[0][1].reasons).toEqual(['test'])
})

it('listen for action from other tabs', () => {
  let store = createStore(increment)
  store.client.emitter.emit('add', { type: 'INC' }, { id: '1 t 0' })
  expect(store.getState()).toEqual({ value: 1 })
})

it('saves previous states', async () => {
  let calls = 0
  let store = createStore((state, action) => {
    if (action.type === 'A') calls += 1
    return state
  })

  let promise = Promise.resolve()
  for (let i = 0; i < 60; i++) {
    if (i % 2 === 0) {
      promise = promise.then(() => {
        return store.dispatch.crossTab({ type: 'A' }, { reasons: ['test'] })
      })
    } else {
      store.dispatch({ type: 'A' })
    }
  }
  await promise
  expect(calls).toEqual(60)
  calls = 0
  await store.dispatch.crossTab(
    { type: 'A' },
    { id: '57 10:test1 1', reasons: ['test'] }
  )
  expect(calls).toEqual(10)
})

it('changes history recording frequency', async () => {
  let calls = 0
  let store = createStore(
    (state, action) => {
      if (action.type === 'A') calls += 1
      return state
    },
    {
      saveStateEvery: 1
    }
  )

  await Promise.all([
    store.dispatch.crossTab({ type: 'A' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'A' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'A' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'A' }, { reasons: ['test'] })
  ])
  calls = 0
  await store.dispatch.crossTab(
    { type: 'A' },
    { id: '3 10:test1 1', reasons: ['test'] }
  )
  expect(calls).toEqual(2)
})

it('cleans its history on removing action', async () => {
  let calls = 0
  let store = createStore(
    (state, action) => {
      if (action.type === 'A') calls += 1
      return state
    },
    {
      saveStateEvery: 2
    }
  )
  let nodeId = store.client.nodeId

  await Promise.all([
    store.dispatch.crossTab({ type: 'A' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'A' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'A' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'A' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'A' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'A' }, { reasons: ['test'] })
  ])
  await store.log.changeMeta(`5 ${nodeId} 0`, { reasons: [] })
  calls = 0
  await store.dispatch.crossTab(
    { type: 'A' },
    { id: `5 ${nodeId} 1`, reasons: ['test'] }
  )
  expect(calls).toEqual(3)
})

it('changes history', async () => {
  let store = createStore(historyLine)

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
  expect(store.getState().value).toEqual('0ab|cd')
})

it('undoes actions', async () => {
  let store = createStore(historyLine)
  let nodeId = store.client.nodeId

  await Promise.all([
    store.dispatch.crossTab({ type: 'ADD', value: 'a' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'ADD', value: 'b' }, { reasons: ['test'] }),
    store.dispatch.crossTab({ type: 'ADD', value: 'c' }, { reasons: ['test'] })
  ])
  expect(store.getState().value).toEqual('0abc')
  store.dispatch.crossTab(
    { type: 'logux/undo', id: `2 ${nodeId} 0` },
    { reasons: ['test'] }
  )
  await delay(1)
  expect(store.getState().value).toEqual('0ac')
})

it('replaces reducer', async () => {
  let store = createStore(historyLine)
  store.dispatch({ type: 'ADD', value: 'a' })
  store.dispatch({ type: 'ADD', value: 'b' })
  expect(store.getState().value).toEqual('0ab')

  store.replaceReducer((state, action) => {
    if (action.type === 'ADD') {
      return { value: state.value + action.value.toUpperCase() }
    } else {
      return state
    }
  })
  await store.dispatch.crossTab(
    { type: 'ADD', value: 'z' },
    { id: '1 10:test1 1', reasons: ['test'] }
  )
  expect(store.getState().value).toEqual('0aZB')
})

it('ignores cleaned history from non-legacy actions', async () => {
  let onMissedHistory = jest.fn()
  let store = createStore(historyLine, {
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
  expect(store.getState().value).toEqual('0|bcd')
  expect(onMissedHistory).not.toHaveBeenCalledWith()
})

it('does not replays actions on logux/ actions', async () => {
  let reduced = []
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
  expect(reduced).toEqual(['A', 'B', 'A'])
  expect(store.log.actions()).toEqual([
    { type: 'logux/subscribe' },
    { type: 'logux/unsubscribe' },
    { type: 'B' },
    { type: 'A' }
  ])
})

it('replays history for reason-less action', async () => {
  let store = createStore(historyLine)
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
  expect(store.getState().value).toEqual('0a|bc')
  expect(store.log.store.created).toHaveLength(3)
})

it('replays actions before staring since initial state', async () => {
  let onMissedHistory = jest.fn()
  let store = createStore(historyLine, {
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
  expect(onMissedHistory).not.toHaveBeenCalled()
  expect(store.getState().value).toEqual('0|bcd')
})

it('replays actions on missed history', async () => {
  let onMissedHistory = jest.fn()
  let store = createStore(historyLine, {
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
  expect(store.getState().value).toEqual('0abc[d')
  expect(onMissedHistory).toHaveBeenCalledWith({ type: 'ADD', value: '[' })
  store.dispatch.crossTab(
    { type: 'ADD', value: ']' },
    { id: '0 10:test1 1', reasons: ['test'] }
  )
  await delay(1)
  expect(store.getState().value).toEqual('0abc[]d')
})

it('works without onMissedHistory', async () => {
  let store = createStore(historyLine, {
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

it('does not fall on missed onMissedHistory', async () => {
  let store = createStore(historyLine)
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
  expect(store.getState().value).toEqual('0|')
})

it('cleans action added without reason', async () => {
  let store = createStore(historyLine, { reasonlessHistory: 3 })

  store.dispatch.local({ type: 'ADD', value: 0 }, { reasons: ['test'] })
  expect(store.log.entries()[0][1].reasons).toEqual(['test'])

  function add (index) {
    return () => {
      store.dispatch({ type: 'ADD', value: 4 * index - 3 })
      store.dispatch.local({ type: 'ADD', value: 4 * index - 2 })
      store.dispatch.crossTab({ type: 'ADD', value: 4 * index - 1 })
      store.dispatch.sync({ type: 'ADD', value: 4 * index })
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
  expect(last[1].reasons).toEqual(['syncing', 'timeTravel'])
  store.dispatch({ type: 'ADD', value: 25 })
  await store.log.removeReason('syncing')
  await delay(1)
  expect(store.log.actions()).toEqual([
    { type: 'ADD', value: 0 },
    { type: 'ADD', value: 23 },
    { type: 'ADD', value: 24 },
    { type: 'ADD', value: 25 }
  ])
})

it('cleans last 1000 by default', async () => {
  let store = createStore(increment)

  let promise = Promise.resolve()
  for (let i = 0; i < 1050; i++) {
    promise = promise.then(() => {
      store.dispatch({ type: 'INC' })
    })
  }

  await promise
  await delay(1)
  expect(store.log.actions()).toHaveLength(1000)
})

it('copies reasons to undo action', async () => {
  let store = createStore(increment)
  let nodeId = store.client.nodeId
  await store.dispatch.crossTab({ type: 'INC' }, { reasons: ['a', 'b'] })
  await store.dispatch.crossTab(
    { type: 'logux/undo', id: `1 ${nodeId} 0` },
    { reasons: [] }
  )
  let result = await store.log.byId(`2 ${nodeId} 0`)
  expect(result[0].type).toEqual('logux/undo')
  expect(result[1].reasons).toEqual(['a', 'b'])
})

it('dispatches local actions', async () => {
  let store = createStore(increment)
  await store.dispatch.local({ type: 'INC' }, { reasons: ['test'] })
  expect(store.log.store.created[0][0]).toEqual({ type: 'INC' })
  expect(store.log.store.created[0][1].tab).toEqual(store.client.tabId)
  expect(store.log.store.created[0][1].reasons).toEqual(['test'])
})

it('allows to miss meta for local actions', async () => {
  let store = createStore(increment)
  store.log.on('preadd', (action, meta) => {
    meta.reasons.push('preadd')
  })
  await store.dispatch.local({ type: 'INC' })
  expect(store.log.store.created[0][0]).toEqual({ type: 'INC' })
})

it('dispatches sync actions', async () => {
  let store = createStore(increment)
  store.dispatch.sync({ type: 'INC' }, { reasons: ['test'] })
  await delay(1)
  let log = store.log.store.created
  expect(log[0][0]).toEqual({ type: 'INC' })
  expect(log[0][1].sync).toBe(true)
  expect(log[0][1].reasons).toEqual(['test', 'syncing'])
})

it('cleans sync action after processing', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  let pair = new TestPair()
  let store = createStore(increment, { server: pair.left })
  let resultA, resultB

  // eslint-disable-next-line jest/valid-expect-in-promise
  store.dispatch
    .sync({ type: 'A' })
    .then(() => {
      resultA = 'processed'
    })
    .catch(e => {
      expect(e.message).toContain('undid')
      expect(e.message).toContain('because of error')
      resultA = e.action.reason
    })
  // eslint-disable-next-line jest/valid-expect-in-promise
  store.dispatch
    .sync({ type: 'B' }, { id: '3 10:1:1 0' })
    .then(() => {
      resultB = 'processed'
    })
    .catch(e => {
      expect(e.message).toContain('undid')
      expect(e.message).toContain('because of error')
      resultB = e.action.reason
    })

  store.log.removeReason('timeTravel')
  await store.log.add({ type: 'logux/processed', id: '0 10:1:1 0' })
  expect(resultA).toBeUndefined()
  expect(resultB).toBeUndefined()
  expect(store.log.actions()).toEqual([{ type: 'A' }, { type: 'B' }])
  await store.log.add({ type: 'logux/processed', id: '1 10:1:1 0' })
  expect(resultA).toEqual('processed')
  expect(resultB).toBeUndefined()
  expect(store.log.actions()).toEqual([{ type: 'B' }])
  store.log.add({ type: 'logux/undo', reason: 'error', id: '3 10:1:1 0' })
  await delay(1)
  expect(resultB).toEqual('error')
  expect(store.log.actions()).toEqual([])
  expect(console.warn).not.toHaveBeenCalled()
})

it('applies old actions from store', async () => {
  let store1 = createStore(historyLine, { reasonlessHistory: 2 })
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
      { type: 'logux/undo', id: '0 10:x 2' },
      { id: '0 10:x 6', reasons: ['test'] }
    )
  ])
  store2 = createStore(historyLine, { store: store1.log.store })

  store2.dispatch({ type: 'ADD', value: 'a' })
  store2.dispatch({ type: 'ADD', value: 'b' })
  store2.dispatch.crossTab({ type: 'ADD', value: 'c' }, { reasons: ['test'] })
  store2.dispatch({ type: 'ADD', value: 'd' })
  store2.dispatch({ type: 'ADD', value: 'e' })
  expect(store2.getState().value).toEqual('0abde')

  await store2.initialize
  expect(store2.getState().value).toEqual('0134abcde')
})

it('supports middlewares', () => {
  let store = createStore(
    historyLine,
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
  expect(store.getState().value).toEqual('0b')
})

it('waits for replaying', async () => {
  let store = createStore(historyLine)
  let run
  let waiting = new Promise(resolve => {
    run = resolve
  })

  let first = true
  let originEach = store.log.each
  store.log.each = async function (...args) {
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
  expect(store.getState().value).toEqual('0b')
  store.log.removeReason('o')
  run()
  await delay(10)
  expect(store.getState().value).toEqual('0abd')
})

it('emits change event', async () => {
  let store = createStore(historyLine)

  store.log.on('preadd', (action, meta) => {
    meta.reasons.push('test')
  })

  let calls = []
  store.on('change', (state, prevState, action, meta) => {
    expect(typeof meta.id).toEqual('string')
    calls.push([state, prevState, action])
  })

  store.dispatch({ type: 'ADD', value: 'a' })
  store.dispatch.local({ type: 'ADD', value: 'c' })
  store.dispatch.local({ type: 'ADD', value: 'b' }, { id: '1 10:test1 1' })
  await delay(10)
  expect(calls).toEqual([
    [{ value: '0a' }, { value: 0 }, { type: 'ADD', value: 'a' }],
    [{ value: '0ac' }, { value: '0a' }, { type: 'ADD', value: 'c' }],
    [{ value: '0abc' }, { value: '0ac' }, { type: 'ADD', value: 'b' }]
  ])
})

it('warns about undoes cleaned action', async () => {
  let store = createStore(increment)
  await store.dispatch.crossTab({ type: 'logux/undo', id: '1 t 0' })
  expect(store.log.actions()).toHaveLength(0)
})

it('does not put reason on request', async () => {
  let store = createStore(increment)
  await store.dispatch.crossTab({ type: 'A' }, { noAutoReason: true })
  await store.dispatch.crossTab({ type: 'B' })
  expect(store.log.actions()).toEqual([{ type: 'B' }])

  await store.dispatch.crossTab({ type: 'a' }, { reasons: ['a'] })
  await store.dispatch.crossTab({ type: 'b' }, { keepLast: 'b' })
  expect(store.log.actions()).toEqual([
    { type: 'B' },
    { type: 'a' },
    { type: 'b' }
  ])
  expect(store.log.entries()[1][1].noAutoReason).toBe(true)
  expect(store.log.entries()[2][1].noAutoReason).toBe(true)
})
