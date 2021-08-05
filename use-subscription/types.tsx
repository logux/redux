import React, { FC } from 'react'

import { useSubscription } from '../index.js'

export const UserList: FC<{ id: number }> = ({ id }) => {
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
