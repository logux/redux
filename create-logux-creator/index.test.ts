import { Action, TestTime, TestLog } from '@logux/core'
import { restoreAll, spyOn } from 'nanospy'
import { ClientMeta } from '@logux/client'
import { Reducer } from 'redux'
import { equal } from 'uvu/assert'
import { test } from 'uvu'

import { createLoguxCreator } from '../index.js'

type AddAction = {
  type: 'ADD'
  value: string
}

function isAdd(action: Action): action is AddAction {
  return action.type === 'ADD'
}

const ADD_A: AddAction = { type: 'ADD', value: 'a' }

type State = {
  value: string
}

function history(state: State, action: Action): State {
  if (isAdd(action)) {
    return { value: `${state.value}${action.value}` }
  } else {
    return state
  }
}

// @ts-ignore
global.WebSocket = () => {}

test.after.each(() => {
  restoreAll()
})

test('creates store', () => {
  let spy = spyOn(console, 'warn', () => {})

  let creator = createLoguxCreator<{}, TestLog<ClientMeta>>({
    server: 'wss://localhost:1337',
    subprotocol: '1.0.0',
    userId: '10',
    time: new TestTime()
  })
  let historyReducer: Reducer = history
  let store = creator(historyReducer, { value: '0' })
  store.dispatch(ADD_A)
  equal(store.getState(), { value: '0a' })
  equal(spy.callCount, 1)
})

test.run()
