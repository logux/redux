import { Action, AnyAction } from 'redux'

import { LoguxDispatch } from '../create-logux-creator/index.js'

/**
 * A hook to access the Logux Redux `dispatch` function.
 *
 * ```js
 * export const Counter = ({ value }) => {
 *   let dispatch = useDispatch()
 *   return (
 *     <div>
 *       <span>{value}</span>
 *       <button onClick={() => dispatch.sync({ type: 'INC' })}>
 *         Increase counter
 *       </button>
 *     </div>
 *   )
 * }
 *
 * @return Logux Redux store’s `dispatch` function.
 */
export function useDispatch<A extends Action = AnyAction> (): LoguxDispatch<A>
