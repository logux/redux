var createLoguxCreator = require('../create-logux-creator')
var index = require('../')

it('has createLoguxCreator function', function () {
  expect(index.createLoguxCreator).toBe(createLoguxCreator)
})
