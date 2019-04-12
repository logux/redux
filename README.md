# Logux Redux

<img align="right" width="95" height="95" title="Logux logo"
     src="https://cdn.rawgit.com/logux/logux/master/logo.svg">

Logux is a new way to connect client and server. Instead of sending
HTTP requests (e.g., AJAX and GraphQL) it synchronizes log of operations
between client, server, and other clients.

**Documentation: [logux/logux]**

This repository contains Redux compatible API on top of [Logux Client].

<a href="https://evilmartians.com/?utm_source=logux-redux">
  <img src="https://evilmartians.com/badges/sponsored-by-evil-martians.svg"
       alt="Sponsored by Evil Martians" width="236" height="54">
</a>

[Logux Client]: https://github.com/logux/client
[logux/logux]: https://github.com/logux/logux

## Install

```sh
npm install @logux/redux
```

## Usage

See [documentation] for Logux API.

```js
import createLoguxCreator from 'logux-redux/create-logux-creator'

import log from '@logux/client/log'

let userId = document.querySelector('meta[name=user]').content
let userToken = document.querySelector('meta[name=token]').content

const createStore = createLoguxCreator({
  credentials: userToken,
  subprotocol: '1.0.0',
  server: 'wss://example.com:1337',
  userId: userToken
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
import useSubscription from 'logux-redux/use-subscription'

export const User = ({ id, name }) => {
  const isSubscribing = useSubscription([`user/${ id }`])
  if (isSubscribing) {
    return <Loader />
  }
  return <h1>{ name }</h1>
}
```

[documentation]: https://github.com/logux/logux
