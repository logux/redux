# Logux Redux

<img align="right" width="95" height="95" title="Logux logo"
     src="https://cdn.rawgit.com/logux/logux/master/logo.svg">

Logux is a client-server communication protocol. It synchronizes action
between clients and server logs.

This library provides Redux compatible API.

## Install

```sh
npm install --save logux-redux
```

## Usage

Create Redux store by `createLoguxCreator`. It returns original Redux `createStore` function with Logux inside

```diff
-import { createStore } from 'redux'
+import createLoguxCreator from 'logux-redux/create-logux-creator'

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

## Dispatch

Instead of Redux, in Logux Redux you have 4 ways to dispatch action:

* `store.dispatch(action)` is legacy API. Try to avoid it since you can’t
  specify how clean this actions.
* `store.dispatch.local(action, meta)` — action will be visible only to current
  browser tab.
* `store.dispatch.crossTab(action, meta)` — action will be visible
  to all browser tab.
* `store.dispatch.sync(action, meta)` — action will be visible to server
  and all browser tabs.

In all 3 new dispatch methods you must to specify `meta.reasons` with array
of “reasons”. It is code names of reasons, why this action should be still
in the log.

```js
store.dispatch.crossTab(
  { type: 'CHANGE_NAME', name }, { reasons: ['lastName'] }
)
```

When you don’t need some actions, you can remove reasons from them:

```js
store.dispatch.crossTab(
  { type: 'CHANGE_NAME', name }, { reasons: ['lastName'] }
).then(meta => {
  store.log.removeReason('lastName', { maxAdded: meta.added - 1 })
})
```

Action with empty reasons will be removed from log.
