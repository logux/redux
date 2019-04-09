var createLoguxCreator = require('../create-logux-creator')
var useSubscription = require('../use-subscription')
var subscribe = require('../subscribe')
var index = require('../')

it('has createLoguxCreator function', function () {
  expect(index.createLoguxCreator).toBe(createLoguxCreator)
})

it('has useSubscription', function () {
  expect(index.useSubscription).toBe(useSubscription)
})

it('has subscribe', function () {
  expect(index.subscribe).toBe(subscribe)
})
