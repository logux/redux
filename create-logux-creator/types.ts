import { createLoguxCreator } from '..'

let createStore = createLoguxCreator({
  subprotocol: '1.0.0',
  server: 'ws://localhost',
  userId: false
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

store.dispatch({ type: 'INC' })
store.dispatch.crossTab({ type: 'INC' }, { reasons: ['reason'] })
store.dispatch.sync({ type: 'INC' }).then(meta => {
  console.log(meta.id)
})
