# Logux Redux

<img align="right" width="95" height="148" title="Logux logotype"
     src="https://logux.io/branding/logotype.svg">

Logux is a new way to connect client and server. Instead of sending
HTTP requests (e.g., AJAX and GraphQL) it synchronizes log of operations
between client, server, and other clients.

**Documentation: [logux.io]**

This repository contains Redux compatible API on top of [Logux Client].

<a href="https://evilmartians.com/?utm_source=logux-redux">
  <img src="https://evilmartians.com/badges/sponsored-by-evil-martians.svg"
       alt="Sponsored by Evil Martians" width="236" height="54">
</a>

[Logux Client]: https://github.com/logux/client
[logux.io]: https://logux.io/

## Install

```sh
npm install @logux/redux
```

## Usage

See [documentation] for Logux API.

```js
import { createLoguxCreator } from '@logux/redux'
import { log } from '@logux/client'

let userId = document.querySelector('meta[name=user]').content
let token = document.querySelector('meta[name=token]').content

const createStore = createLoguxCreator({
  subprotocol: '1.0.0',
  server: 'wss://example.com:1337',
  userId,
  token
})

const store = createStore(reducers, preloadedState)
log(store.client)

export default store
```

```js
import { Provider } from 'react-redux'
import ReactDOM from 'react-dom'

import store from './store'
import App from './App'

ReactDOM.render(
  <Provider store={store}><App /></Provider>,
  document.getElementById('root')
)
```

```js
import { useSubscription } from '@logux/redux'

export const User = ({ id, name }) => {
  const isSubscribing = useSubscription([`user/${ id }`])
  if (isSubscribing) {
    return <Loader />
  } else {
    return <h1>{ name }</h1>
  }
}
```

[documentation]: https://github.com/logux/logux
