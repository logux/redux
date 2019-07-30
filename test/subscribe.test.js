let { createContext, Component } = require('react')
let { Provider } = require('react-redux')
let { TestTime } = require('@logux/core')
let renderer = require('react-test-renderer')
let delay = require('nanodelay')
let h = require('react').createElement

let createLoguxCreator = require('../create-logux-creator')
let subscribe = require('../subscribe')

jest.mock('react', () => {
  let React = require('react/cjs/react.development.js')
  React.useEffect = React.useLayoutEffect
  return React
})

function createComponent (content) {
  let createStore = createLoguxCreator({
    subprotocol: '0.0.0',
    server: 'wss://localhost:1337',
    userId: false,
    time: new TestTime()
  })
  let store = createStore(() => ({ }))
  let component = renderer.create(h(Provider, { store }, content))
  component.client = store.client
  return component
}

function UserPhoto (props) {
  return h('img', {
    isSubscribing: props.isSubscribing,
    src: props.id + '.jpg'
  })
}
let SubscribeUserPhoto = subscribe(({ id }) => {
  return { channel: `users/${ id }`, fields: ['photo'] }
})(UserPhoto)

it('passes properties', () => {
  function Post ({ title, children }) {
    return h('article', { },
      h('h1', { }, title),
      children)
  }
  let SubscribePost = subscribe(() => 'posts/10')(Post)

  let component = createComponent(
    h(SubscribePost, { title: 'A' }, h('p', { }, 'Text'))
  )
  expect(component.toJSON()).toEqual({
    type: 'article',
    props: { },
    children: [
      { type: 'h1', props: { }, children: ['A'] },
      { type: 'p', props: { }, children: ['Text'] }
    ]
  })
})

it('returns wrapped component', () => {
  expect(SubscribeUserPhoto.WrappedComponent).toBe(UserPhoto)
})

it('subscribes', async () => {
  function User () {
    return null
  }
  let SubscribeUser = subscribe(({ id }) => `users/${ id }`)(User)

  let component = createComponent(h('div', { }, [
    h(SubscribeUser, { id: '1', key: 1 }),
    h(SubscribeUser, { id: '1', key: 2 }),
    h(SubscribeUser, { id: '2', key: 3 })
  ]))
  await delay(1)
  expect(component.client.log.actions()).toEqual([
    { type: 'logux/subscribe', channel: 'users/1' },
    { type: 'logux/subscribe', channel: 'users/2' }
  ])
})

it('subscribes by channel name', async () => {
  function Users () {
    return null
  }
  let SubscribeUsers = subscribe(['users'])(Users)

  let component = createComponent(h('div', { }, [
    h(SubscribeUsers, { key: 1 }),
    h(SubscribeUsers, { key: 2 })
  ]))
  await delay(1)
  expect(component.client.log.actions()).toEqual([
    { type: 'logux/subscribe', channel: 'users' }
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
        return h(SubscribeUserPhoto, { id: users[key], key })
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
        h(SubscribeUserPhoto, { id: this.state.id })
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
        h(SubscribeUserPhoto, { id: 1, nonId: this.state.id })
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

it('supports multiple channels', async () => {
  function User () {
    return null
  }
  let SubscribeUser = subscribe(({ id }) => {
    return [`users/${ id }`, `pictures/${ id }`]
  })(User)

  let component = createComponent(h('div', { }, [
    h(SubscribeUser, { id: '1', key: 1 }),
    h(SubscribeUser, { id: '1', key: 2 }),
    h(SubscribeUser, { id: '2', key: 3 })
  ]))
  await delay(1)
  expect(component.client.log.actions()).toEqual([
    { type: 'logux/subscribe', channel: 'users/1' },
    { type: 'logux/subscribe', channel: 'pictures/1' },
    { type: 'logux/subscribe', channel: 'users/2' },
    { type: 'logux/subscribe', channel: 'pictures/2' }
  ])
})

it('supports different store sources', async () => {
  let MyContext = createContext()

  let LoguxUserPhoto = subscribe(({ id }) => `users/${ id }`, {
    context: MyContext
  })(UserPhoto)

  let createStore = createLoguxCreator({
    subprotocol: '0.0.0',
    server: 'wss://localhost:1337',
    userId: false,
    time: new TestTime()
  })
  let store = createStore(() => ({ }))

  class Profile extends Component {
    getChildContext () {
      return { logux: store }
    }

    render () {
      return h(Provider, { context: MyContext, store },
        h('div', { onClick: this.change },
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
        h(SubscribeUserPhoto, { id: this.state.id })
      )
    }
  }

  let component = createComponent(h(Profile, { }))
  let nodeId = component.client.nodeId
  let log = component.client.log
  await delay(1)
  expect(component.toJSON().children[0].props.isSubscribing).toBeTruthy()
  component.toJSON().props.onClick(1)
  await delay(1)
  expect(component.toJSON().children[0].props.isSubscribing).toBeTruthy()
  component.toJSON().props.onClick(2)
  await delay(1)
  expect(component.toJSON().children[0].props.isSubscribing).toBeTruthy()
  log.add({ type: 'logux/processed', id: '1 ' + nodeId + ' 0' })
  await delay(1)
  expect(component.toJSON().children[0].props.isSubscribing).toBeTruthy()
  log.add({ type: 'logux/processed', id: '3 ' + nodeId + ' 0' })
  await delay(1)
  expect(component.toJSON().children[0].props.isSubscribing).toBeFalsy()
})

it('allows to change subscribing prop', async () => {
  function UserPhoto2 (props) {
    return h('img', props)
  }
  let SubscribeUserPhoto2 = subscribe(() => 'user/2', {
    subscribingProp: 'isLoading'
  })(UserPhoto2)

  let component = createComponent(h(SubscribeUserPhoto2, { one: 1 }))
  let nodeId = component.client.nodeId
  let log = component.client.log
  await delay(1)
  expect(component.toJSON().props).toEqual({ isLoading: true, one: 1 })
  log.add({ type: 'logux/processed', id: '1 ' + nodeId + ' 0' })
  await delay(1)
  expect(component.toJSON().props).toEqual({ isLoading: false, one: 1 })
})
