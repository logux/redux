let createLoguxCreator = require('../create-logux-creator')
let useSubscription = require('../use-subscription')
let subscribe = require('../subscribe')
let index = require('../')

it('has createLoguxCreator function', () => {
  expect(index.createLoguxCreator).toBe(createLoguxCreator)
})

it('has useSubscription', () => {
  expect(index.useSubscription).toBe(useSubscription)
})

it('has subscribe', () => {
  expect(index.subscribe).toBe(subscribe)
})
