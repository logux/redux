# Logux Redux

<img align="right" width="95" height="95" title="Logux logo"
     src="https://cdn.rawgit.com/logux/logux/master/logo.svg">

Logux is a client-server communication protocol. It synchronizes action
between clients and server logs.

This library provides Redux compatible API.

### Install
```shell
npm install logux-redux
```

### Usage
Create Redux store by `createLoguxCreator`. It returns original Redux `createStore` function with Logux inside
```diff js
-import { createStore } from 'redux'
+import { createLoguxCreator } from 'logux-redux'

+const createStore = createLoguxCreator({
+  subprotocol: '1.0.0',
+  server: 'wss://localhost:1337',
+  userId: 10
+})

function reducer (state, action) {
  switch (action.type) {
    case 'INC':
      return { value: state.value + 1 }
    default:
      return state
  }
}

const preloadedState = { value: 0 }

const store = createStore( reducer, preloadedState, enhancer )

+store.client.start()
```
See also [Logux Status] for UX best practices.

[Logux Status]: https://github.com/logux/logux-status

<a href="https://evilmartians.com/?utm_source=logux-redux">
  <img src="https://evilmartians.com/badges/sponsored-by-evil-martians.svg"
       alt="Sponsored by Evil Martians" width="236" height="54">
</a>
