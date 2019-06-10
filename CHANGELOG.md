# Change Log
This project adheres to [Semantic Versioning](http://semver.org/).

## 0.2.5
* Fix compatibility with Logux Client 0.3.2.

## 0.2.4
* Fix double subscription.

## 0.2.3
* Fix React Redux warning.

## 0.2.2
* Fix peer dependencies.

## 0.2.1
* Reduce size.

## 0.2
* Rename project from `logux-redux` to `@logux/redux`.
* Merge with `react-logux`.
* Use Logux Core 0.3.
* Use React Redux 7 and new React Context.
* Add `useSubscription` hook.
* Add `isSubscribing` property to `connect()`.
* Return `Promise` from `dispatch.sync()`.
* Pass `enhancer` to `createStore` (by Dan Onoshko).

## 0.1.7
* Use Redux 4.

## 0.1.6
* Fix time traveling to the same position with 2 actions.

## 0.1.5
* Fix time traveling algorithm.

## 0.1.4
* Allow to miss `meta` in `dispatch.local()`.

## 0.1.3
* Fix middleware support for legacy actions.

## 0.1.2
* Don’t apply action if it was deleted during waiting for replay end.

## 0.1.1
* Fix inserting reasons-less action in the middle of history.

## 0.1
* Initial release.
