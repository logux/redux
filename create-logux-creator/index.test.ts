import { Action, TestTime, TestLog } from '@logux/core'
import { ClientMeta } from '@logux/client'
import { Reducer } from 'redux'

import { createLoguxCreator } from '../index.js'

type AddAction = {
  type: 'ADD'
  value: string
}

function isAdd (action: Action): action is AddAction {
  return action.type === 'ADD'
}

const ADD_A: AddAction = { type: 'ADD', value: 'a' }

type State = {
  value: string
}

function history (state: State, action: Action) {
  if (isAdd(action)) {
    return { value: `${state.value}${action.value}` }
  } else {
    return state
  }
}

it('creates store', () => {
  let spy = jest.spyOn(console, 'warn').mockImplementation()

  let creator = createLoguxCreator<{}, TestLog<ClientMeta>>({
    server: 'wss://localhost:1337',
    subprotocol: '1.0.0',
    userId: '10',
    time: new TestTime()
  })
  let historyReducer: Reducer = history
  let store = creator(historyReducer, { value: '0' })
  store.dispatch(ADD_A)
  expect(store.getState()).toEqual({ value: '0a' })
  expect(console.warn).toHaveBeenCalledTimes(1)
  spy.mockRestore()
})
