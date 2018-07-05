var createLoguxCreator = require('../create-logux-creator')
var subscribe = require('../subscribe')
var index = require('../')

it('has createLoguxCreator function', function () {
  expect(index.createLoguxCreator).toBe(createLoguxCreator)
})

it('has subscribe', function () {
  expect(index.subscribe).toBe(subscribe)
})
