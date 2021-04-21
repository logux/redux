import { FC } from 'react'

import { useDispatch } from '../index.js'

interface IncAction {
  type: 'INC'
}

export const Counter: FC<{ value: number }> = ({ value }) => {
  let dispatch = useDispatch<IncAction>()
  return (
    <div>
      <span>{value}</span>
      <button onClick={() => dispatch.sync({ type: 'INC' })}>
        Increase counter
      </button>
    </div>
  )
}
