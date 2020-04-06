let { Component, createContext } = require('react')
let { createElement: h } = require('react')
let { Provider } = require('react-redux')
let { TestTime } = require('@logux/core')
let { delay } = require('nanodelay')
let renderer = require('react-test-renderer')

let { createLoguxCreator, useSubscription } = require('..')

jest.mock('react', () => {
  let React = require('react/cjs/react.development.js')
  React.useEffect = React.useLayoutEffect
  return React
})

function createComponent (content) {
  let createStore = createLoguxCreator({
    subprotocol: '0.0.0',
    server: 'wss://localhost:1337',
    userId: '10',
    time: new TestTime()
  })
  let store = createStore(() => ({ }))
  let component = renderer.create(h(Provider, { store }, content))
  component.client = store.client
  return component
}

function UserPhoto ({ id }) {
  let isSubscribing = useSubscription([
    { channel: `users/${ id }`, fields: ['photo'] }
  ])
  return h('img', { isSubscribing, src: `${ id }.jpg` })
}

it('subscribes', async () => {
  let component = createComponent(h('div', { }, [
    h(UserPhoto, { id: '1', key: 1 }),
    h(UserPhoto, { id: '1', key: 2 }),
    h(UserPhoto, { id: '2', key: 3 })
  ]))
  await delay(1)
  expect(component.client.log.actions()).toEqual([
    { type: 'logux/subscribe', channel: 'users/1', fields: ['photo'] },
    { type: 'logux/subscribe', channel: 'users/2', fields: ['photo'] }
  ])
})

it('accepts channel names', async () => {
  function User ({ id }) {
    useSubscription([`users/${ id }`, `users/${ id }/comments`])
    return h('div')
  }
  let component = createComponent(h('div', { }, [
    h(User, { id: '1', key: 1 })
  ]))
  await delay(1)
  expect(component.client.log.actions()).toEqual([
    { type: 'logux/subscribe', channel: 'users/1' },
    { type: 'logux/subscribe', channel: 'users/1/comments' }
  ])
})

it('unsubscribes', async () => {
  class UserList extends Component {
    constructor (props) {
      super(props)
      this.state = { users: { a: 1, b: 1, c: 2 } }
    }

    change (users) {
      this.setState({ users })
    }

    render () {
      let users = this.state.users
      return h('div', {
        onClick: this.change.bind(this)
      }, Object.keys(this.state.users).map(key => {
        return h(UserPhoto, { id: users[key], key })
      }))
    }
  }

  let component = createComponent(h(UserList, { }))
  await delay(1)
  expect(component.client.log.actions()).toEqual([
    { type: 'logux/subscribe', channel: 'users/1', fields: ['photo'] },
    { type: 'logux/subscribe', channel: 'users/2', fields: ['photo'] }
  ])
  component.toJSON().props.onClick({ a: 1, c: 2 })
  await delay(1)
  expect(component.client.log.actions()).toEqual([
    { type: 'logux/subscribe', channel: 'users/1', fields: ['photo'] },
    { type: 'logux/subscribe', channel: 'users/2', fields: ['photo'] }
  ])
  component.toJSON().props.onClick({ a: 1 })
  await delay(1)
  expect(component.client.log.actions()).toEqual([
    { type: 'logux/subscribe', channel: 'users/1', fields: ['photo'] },
    { type: 'logux/subscribe', channel: 'users/2', fields: ['photo'] },
    { type: 'logux/unsubscribe', channel: 'users/2', fields: ['photo'] }
  ])
})

it('changes subscription', async () => {
  class Profile extends Component {
    constructor (props) {
      super(props)
      this.state = { id: 1 }
    }

    change (id) {
      this.setState({ id })
    }

    render () {
      return h('div', { onClick: this.change.bind(this) },
        h(UserPhoto, { id: this.state.id })
      )
    }
  }

  let component = createComponent(h(Profile, { }))
  await delay(1)
  expect(component.client.log.actions()).toEqual([
    { type: 'logux/subscribe', channel: 'users/1', fields: ['photo'] }
  ])
  component.toJSON().props.onClick(2)
  await delay(1)
  expect(component.client.log.actions()).toEqual([
    { type: 'logux/subscribe', channel: 'users/1', fields: ['photo'] },
    { type: 'logux/unsubscribe', channel: 'users/1', fields: ['photo'] },
    { type: 'logux/subscribe', channel: 'users/2', fields: ['photo'] }
  ])
})

it('does not resubscribe on non-relevant props changes', () => {
  class Profile extends Component {
    constructor (props) {
      super(props)
      this.state = { id: 1 }
    }

    change (id) {
      this.setState({ id })
    }

    render () {
      return h('div', { onClick: this.change.bind(this) },
        h(UserPhoto, { id: 1, nonId: this.state.id })
      )
    }
  }

  let component = createComponent(h(Profile, { }))

  let resubscriptions = 0
  component.client.log.on('add', () => {
    resubscriptions += 1
  })

  component.toJSON().props.onClick(2)
  expect(resubscriptions).toEqual(0)
})

it('supports different store sources', async () => {
  let MyContext = createContext()

  function LoguxUserPhoto () {
    useSubscription(['users/1'], { context: MyContext })
    return h('div')
  }

  let createStore = createLoguxCreator({
    subprotocol: '0.0.0',
    server: 'wss://localhost:1337',
    userId: '10',
    time: new TestTime()
  })
  let store = createStore(() => ({ }))

  class Profile extends Component {
    getChildContext () {
      return { logux: store }
    }

    render () {
      return h(Provider, { context: MyContext, store },
        h('div', null,
          h(LoguxUserPhoto, { id: 1 })
        )
      )
    }
  }

  Profile.childContextTypes = {
    logux () { }
  }

  createComponent(h(Profile, { }))
  await delay(1)
  expect(store.client.log.actions()).toEqual([
    { type: 'logux/subscribe', channel: 'users/1' }
  ])
})

it('reports about subscription end', async () => {
  class Profile extends Component {
    constructor (props) {
      super(props)
      this.state = { id: 1 }
    }

    change (id) {
      this.setState({ id })
    }

    render () {
      return h('div', { onClick: this.change.bind(this) },
        h(UserPhoto, { id: this.state.id })
      )
    }
  }

  let component = createComponent(h(Profile, { }))
  let nodeId = component.client.nodeId
  let log = component.client.log
  await delay(1)
  expect(component.toJSON().children[0].props.isSubscribing).toBe(true)
  renderer.act(() => {
    component.toJSON().props.onClick(1)
  })
  expect(component.toJSON().children[0].props.isSubscribing).toBe(true)
  renderer.act(() => {
    component.toJSON().props.onClick(2)
  })
  expect(component.toJSON().children[0].props.isSubscribing).toBe(true)
  await renderer.act(async () => {
    log.add({ type: 'logux/processed', id: `1 ${ nodeId } 0` })
    await delay(1)
  })
  expect(component.toJSON().children[0].props.isSubscribing).toBe(true)
  await renderer.act(async () => {
    log.add({ type: 'logux/processed', id: `3 ${ nodeId } 0` })
    await delay(1)
  })
  expect(component.toJSON().children[0].props.isSubscribing).toBe(false)
})

it('works on channels size changes', () => {
  jest.spyOn(console, 'error')
  function UserList ({ ids }) {
    useSubscription(ids.map(id => `users/${ id }`))
    return h('div')
  }
  class UsersPage extends Component {
    constructor (props) {
      super(props)
      this.state = { ids: [1] }
    }

    change (ids) {
      this.setState({ ids })
    }

    render () {
      return h('div', { onClick: this.change.bind(this) },
        h(UserList, { ids: this.state.ids })
      )
    }
  }

  let component = createComponent(h(UsersPage, { }))
  renderer.act(() => {
    component.toJSON().props.onClick([1, 2])
  })
  expect(console.error).not.toHaveBeenCalled()
})
