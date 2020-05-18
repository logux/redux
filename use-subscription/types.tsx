import * as React from 'react'

import { useSubscription } from '..'

export function UserList ({ id }: { id: number }) {
  let isLoading = useSubscription([
    'users',
    { channel: `user/${id}`, fields: ['name'] }
  ])
  if (isLoading) {
    return <div>Loading</div>
  } else {
    return <h1>Users:</h1>
  }
}
