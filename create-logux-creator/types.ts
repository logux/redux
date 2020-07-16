import { Action } from '@logux/core'

import { createLoguxCreator } from '../index.js'

let createStore = createLoguxCreator({
  subprotocol: '1.0.0',
  server: 'ws://localhost',
  userId: '10'
})

type CounterState = number

interface IncAction {
  type: 'INC'
}

function isInc (action: Action): action is IncAction {
  return action.type === 'INC'
}

function reducer (state: CounterState = 0, action: IncAction): CounterState {
  if (isInc(action)) {
    return state + 1
  } else {
    return state
  }
}

let store = createStore<CounterState, IncAction>(reducer)

store.dispatch({ type: 'INC' })
store.dispatch.crossTab({ type: 'INC' }, { reasons: ['reason'] })
store.dispatch.sync({ type: 'INC' }).then(meta => {
  console.log(meta.id)
})

console.log(store.getState().toFixed())
