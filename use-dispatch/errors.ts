import { useDispatch } from '../index.js'

interface IncAction {
  type: 'INC'
}

let dispatch = useDispatch<IncAction>()

// THROWS Type '"RENAME"' is not assignable to type '"INC"'.
dispatch.sync({ type: 'RENAME' })
