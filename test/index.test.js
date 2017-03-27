var createLoguxStore = require('../create-logux-store')
var index = require('../')

it('has createLoguxStore function', function () {
  expect(index.createLoguxStore).toBe(createLoguxStore)
})
