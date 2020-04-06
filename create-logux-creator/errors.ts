import { createLoguxCreator } from '..'

let createStore = createLoguxCreator({
  subprotocol: '1.0.0',
  server: 'ws://localhost',
  userId: '10'
})

type CounterState = number

interface IncAction {
  type: 'INC'
}

function reducer (state: CounterState = 0, action: IncAction): CounterState {
  if (action.type === 'INC') {
    return state + 1
  } else {
    return state
  }
}

let store = createStore<CounterState, IncAction>(reducer)

// THROWS Type '"RENAME"' is not assignable to type '"INC"'.
store.dispatch({ type: 'RENAME' }, { reasons: ['reason'] })
// THROWS Type 'number' is not assignable to type 'string[] | undefined'.
store.dispatch.crossTab({ type: 'INC' }, { reasons: 1 })
