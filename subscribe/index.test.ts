import {
  FunctionComponent,
  Component,
  createContext,
  ReactNode,
  createElement as h
} from 'react'
import { TestTime, TestLog } from '@logux/core'
import { create, act } from 'react-test-renderer'
import { ClientMeta } from '@logux/client'
import { Provider } from 'react-redux'
import { delay } from 'nanodelay'

import {
  createStoreCreator,
  LoguxReduxStore,
  CrossTabClient,
  subscribe
} from '../index.js'

jest.mock('react', () => {
  let React = require('react/cjs/react.development.js')
  React.useEffect = React.useLayoutEffect
  return React
})

function createComponent (content: ReactNode) {
  let client = new CrossTabClient<{}, TestLog<ClientMeta>>({
    subprotocol: '0.0.0',
    server: 'wss://localhost:1337',
    userId: '10',
    time: new TestTime()
  })
  let createStore = createStoreCreator(client)
  let store = createStore(() => ({}))
  let component = create(h(Provider, { store }, content))
  return { ...component, client: store.client }
}

type Users = {
  [key: string]: number
}

type UserPhotoProps = {
  id: number
  isSubscribing: boolean
}

type SubsribedUserPhotoProps = {
  id: number
  nonId?: number
}

let UserPhoto: FunctionComponent<UserPhotoProps> = ({ id, isSubscribing }) => {
  return h('img', { isSubscribing, src: `${id}.jpg` })
}

let SubscribeUserPhoto = subscribe<SubsribedUserPhotoProps>(({ id }) => {
  return { channel: `users/${id}`, fields: ['photo'] }
})(UserPhoto)

function getJSON (component: ReturnType<typeof createComponent>) {
  let value = component.toJSON()
  if (value === null || 'length' in value) {
    throw new Error('Wrong JSON result')
  }
  return value
}

function click (component: ReturnType<typeof createComponent>, event: any) {
  getJSON(component).props.onClick(event)
}

function getProps (component: ReturnType<typeof createComponent>, i?: number) {
  let node = getJSON(component)
  if (typeof i !== 'undefined') {
    if (node.children === null) throw new Error('Component has no childern')
    let child = node.children[i]
    if (typeof child !== 'object') throw new Error('Child has no a object')
    return child.props
  } else {
    return node.props
  }
}

it('passes properties', () => {
  let Post: FunctionComponent<{ title: string }> = ({ title, children }) => {
    return h('article', {}, h('h1', {}, title), children)
  }
  let SubscribePost = subscribe<{ title: string }>(() => 'posts/10')(Post)

  let component = createComponent(
    h(SubscribePost, { title: 'A' }, h('p', {}, 'Text'))
  )
  expect(component.toJSON()).toEqual({
    type: 'article',
    props: {},
    children: [
      { type: 'h1', props: {}, children: ['A'] },
      { type: 'p', props: {}, children: ['Text'] }
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
  let SubscribeUser = subscribe<{ id: number }>(({ id }) => `users/${id}`)(User)

  let component = createComponent(
    h('div', {}, [
      h(SubscribeUser, { id: 1, key: 1 }),
      h(SubscribeUser, { id: 1, key: 2 }),
      h(SubscribeUser, { id: 2, key: 3 })
    ])
  )
  await delay(1)
  expect(component.client.log.actions()).toEqual([
    { type: 'logux/subscribe', channel: 'users/1' },
    { type: 'logux/subscribe', channel: 'users/2' }
  ])
})

it('subscribes by channel name', async () => {
  function UserList () {
    return null
  }
  let SubscribeUsers = subscribe(['users'])(UserList)

  let component = createComponent(
    h('div', {}, [h(SubscribeUsers, { key: 1 }), h(SubscribeUsers, { key: 2 })])
  )
  await delay(1)
  expect(component.client.log.actions()).toEqual([
    { type: 'logux/subscribe', channel: 'users' }
  ])
})

it('unsubscribes', async () => {
  class UserList extends Component<{}, { users: Users }> {
    constructor (props: {}) {
      super(props)
      this.state = { users: { a: 1, b: 1, c: 2 } }
    }

    change (users: Users) {
      this.setState({ users })
    }

    render () {
      let users = this.state.users
      return h(
        'div',
        {
          onClick: this.change.bind(this)
        },
        Object.keys(this.state.users).map(key => {
          return h(SubscribeUserPhoto, { id: users[key], key })
        })
      )
    }
  }

  let component = createComponent(h(UserList, {}))
  await delay(1)
  expect(component.client.log.actions()).toEqual([
    { type: 'logux/subscribe', channel: 'users/1', fields: ['photo'] },
    { type: 'logux/subscribe', channel: 'users/2', fields: ['photo'] }
  ])
  click(component, { a: 1, c: 2 })
  await delay(1)
  expect(component.client.log.actions()).toEqual([
    { type: 'logux/subscribe', channel: 'users/1', fields: ['photo'] },
    { type: 'logux/subscribe', channel: 'users/2', fields: ['photo'] }
  ])
  click(component, { a: 1 })
  await delay(1)
  expect(component.client.log.actions()).toEqual([
    { type: 'logux/subscribe', channel: 'users/1', fields: ['photo'] },
    { type: 'logux/subscribe', channel: 'users/2', fields: ['photo'] },
    { type: 'logux/unsubscribe', channel: 'users/2', fields: ['photo'] }
  ])
})

it('changes subscription', async () => {
  class Profile extends Component<{}, { id: number }> {
    constructor (props: {}) {
      super(props)
      this.state = { id: 1 }
    }

    change (id: number) {
      this.setState({ id })
    }

    render () {
      return h(
        'div',
        { onClick: this.change.bind(this) },
        h(SubscribeUserPhoto, { id: this.state.id })
      )
    }
  }

  let component = createComponent(h(Profile, {}))
  await delay(1)
  expect(component.client.log.actions()).toEqual([
    { type: 'logux/subscribe', channel: 'users/1', fields: ['photo'] }
  ])
  click(component, 2)
  await delay(1)
  expect(component.client.log.actions()).toEqual([
    { type: 'logux/subscribe', channel: 'users/1', fields: ['photo'] },
    { type: 'logux/unsubscribe', channel: 'users/1', fields: ['photo'] },
    { type: 'logux/subscribe', channel: 'users/2', fields: ['photo'] }
  ])
})

it('does not resubscribe on non-relevant props changes', () => {
  class Profile extends Component<{}, { id: number }> {
    constructor (props: {}) {
      super(props)
      this.state = { id: 1 }
    }

    change (id: number) {
      this.setState({ id })
    }

    render () {
      return h(
        'div',
        { onClick: this.change.bind(this) },
        h(SubscribeUserPhoto, { id: 1, nonId: this.state.id })
      )
    }
  }

  let component = createComponent(h(Profile, {}))

  let resubscriptions = 0
  component.client.log.on('add', () => {
    resubscriptions += 1
  })

  click(component, 2)
  expect(resubscriptions).toEqual(0)
})

it('supports multiple channels', async () => {
  function User () {
    return null
  }
  let SubscribeUser = subscribe<{ id: number }>(({ id }) => {
    return [`users/${id}`, `pictures/${id}`]
  })(User)

  let component = createComponent(
    h('div', {}, [
      h(SubscribeUser, { id: 1, key: 1 }),
      h(SubscribeUser, { id: 1, key: 2 }),
      h(SubscribeUser, { id: 2, key: 3 })
    ])
  )
  await delay(1)
  expect(component.client.log.actions()).toEqual([
    { type: 'logux/subscribe', channel: 'users/1' },
    { type: 'logux/subscribe', channel: 'pictures/1' },
    { type: 'logux/subscribe', channel: 'users/2' },
    { type: 'logux/subscribe', channel: 'pictures/2' }
  ])
})

it('supports different store sources', async () => {
  let client = new CrossTabClient<{}, TestLog<ClientMeta>>({
    subprotocol: '0.0.0',
    server: 'wss://localhost:1337',
    userId: '10',
    time: new TestTime()
  })
  let createStore = createStoreCreator(client)
  let store = createStore(() => ({}))

  let MyContext = createContext<{ store: LoguxReduxStore }>({ store })

  let LoguxUserPhoto = subscribe<{ id: number }>(({ id }) => `users/${id}`, {
    context: MyContext
  })(UserPhoto)

  let Profile: FunctionComponent = () => {
    return h(
      MyContext.Provider,
      { value: { store } },
      h('div', null, h(LoguxUserPhoto, { id: 1 }))
    )
  }

  createComponent(h(Profile, {}))
  await delay(1)
  expect(store.client.log.actions()).toEqual([
    { type: 'logux/subscribe', channel: 'users/1' }
  ])
})

it('reports about subscription end', async () => {
  class Profile extends Component<{}, { id: number }> {
    constructor (props: {}) {
      super(props)
      this.state = { id: 1 }
    }

    change (id: number) {
      this.setState({ id })
    }

    render () {
      return h(
        'div',
        { onClick: this.change.bind(this) },
        h(SubscribeUserPhoto, { id: this.state.id })
      )
    }
  }

  let component = createComponent(h(Profile, {}))
  let nodeId = component.client.nodeId
  let log = component.client.log
  await delay(1)
  expect(getProps(component, 0).isSubscribing).toBe(true)
  await act(async () => {
    click(component, 1)
    await delay(1)
  })
  expect(getProps(component, 0).isSubscribing).toBe(true)
  await act(async () => {
    click(component, 2)
    await delay(1)
  })
  expect(getProps(component, 0).isSubscribing).toBe(true)
  await act(async () => {
    log.add({ type: 'logux/processed', id: '1 ' + nodeId + ' 0' })
    await delay(1)
  })
  expect(getProps(component, 0).isSubscribing).toBe(true)
  await act(async () => {
    log.add({ type: 'logux/processed', id: '3 ' + nodeId + ' 0' })
    await delay(1)
  })
  expect(getProps(component, 0).isSubscribing).toBe(false)
})

it('allows to change subscribing prop', async () => {
  type UserPhoto2Props = {
    one: number
    isSubscribing: boolean
  }
  let UserPhoto2: FunctionComponent<UserPhoto2Props> = props => {
    return h('img', props)
  }
  type Props = {
    one: number
  }
  let SubscribeUserPhoto2 = subscribe<Props>(() => 'user/2', {
    subscribingProp: 'isLoading'
  })(UserPhoto2)

  let component = createComponent(h(SubscribeUserPhoto2, { one: 1 }))
  let nodeId = component.client.nodeId
  let log = component.client.log
  await delay(1)
  expect(getProps(component)).toEqual({ isLoading: true, one: 1 })
  await act(async () => {
    log.add({ type: 'logux/processed', id: '1 ' + nodeId + ' 0' })
    await delay(1)
  })
  expect(getProps(component)).toEqual({ isLoading: false, one: 1 })
})
