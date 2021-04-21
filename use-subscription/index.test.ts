import {
  createElement as h,
  createContext,
  Component,
  ReactNode,
  FC
} from 'react'
import {
  ReactTestRendererJSON,
  ReactTestRenderer,
  create,
  act
} from 'react-test-renderer'
import { ClientMeta, CrossTabClient } from '@logux/client'
import { TestTime, TestLog } from '@logux/core'
import { Provider } from 'react-redux'
import { delay } from 'nanodelay'
import { jest } from '@jest/globals'

import {
  createStoreCreator,
  useSubscription,
  LoguxReduxStore
} from '../index.js'

interface TestComponent extends ReactTestRenderer {
  client: CrossTabClient<{}, TestLog<ClientMeta>>
}

function createComponent(content: ReactNode): TestComponent {
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

interface Users {
  [key: string]: number
}

interface UserPhotoProps {
  id: number
  nonId?: number
  debounce?: number
}

let UserPhoto: FC<UserPhotoProps> = ({ id, debounce = 0 }) => {
  let isSubscribing = useSubscription(
    [{ channel: `users/${id}`, fields: ['photo'] }],
    { debounce }
  )
  return h('img', { isSubscribing, src: `${id}.jpg` })
}

function getJSON(component: TestComponent): ReactTestRendererJSON {
  let value = component.toJSON()
  if (value === null || 'length' in value) {
    throw new Error('Wrong JSON result')
  }
  return value
}

function click(component: TestComponent, event: any): void {
  getJSON(component).props.onClick(event)
}

function childProps(
  component: TestComponent,
  i: number
): ReactTestRendererJSON['props'] {
  let node = getJSON(component)
  if (node.children === null) throw new Error('Component has no childern')
  let child = node.children[i]
  if (typeof child !== 'object') throw new Error('Child has no a object')
  return child.props
}

it('subscribes', async () => {
  let component = createComponent(
    h('div', {}, [
      h(UserPhoto, { id: 1, key: 1 }),
      h(UserPhoto, { id: 1, key: 2 }),
      h(UserPhoto, { id: 2, key: 3 })
    ])
  )
  await delay(1)
  expect(component.client.log.actions()).toEqual([
    { type: 'logux/subscribe', channel: 'users/1', fields: ['photo'] },
    { type: 'logux/subscribe', channel: 'users/2', fields: ['photo'] }
  ])
})

it('accepts channel names', async () => {
  let User: FC<{ id: string }> = ({ id }) => {
    useSubscription([`users/${id}`, `users/${id}/comments`])
    return h('div')
  }
  let component = createComponent(h('div', {}, [h(User, { id: '1', key: 1 })]))
  await delay(1)
  expect(component.client.log.actions()).toEqual([
    { type: 'logux/subscribe', channel: 'users/1' },
    { type: 'logux/subscribe', channel: 'users/1/comments' }
  ])
})

it('unsubscribes', async () => {
  class UserList extends Component<{}, { users: Users }> {
    constructor(props: {}) {
      super(props)
      this.state = { users: { a: 1, b: 1, c: 2 } }
    }

    change(users: Users): void {
      this.setState({ users })
    }

    render(): ReactNode {
      return h(
        'div',
        {
          onClick: this.change.bind(this)
        },
        Object.entries(this.state.users).map(([key, id]) => {
          return h(UserPhoto, { id, key })
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
    constructor(props: {}) {
      super(props)
      this.state = { id: 1 }
    }

    change(id: number): void {
      this.setState({ id })
    }

    render(): ReactNode {
      return h(
        'div',
        { onClick: this.change.bind(this) },
        h(UserPhoto, { id: this.state.id })
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
    constructor(props: {}) {
      super(props)
      this.state = { id: 1 }
    }

    change(id: number): void {
      this.setState({ id })
    }

    render(): ReactNode {
      return h(
        'div',
        { onClick: this.change.bind(this) },
        h(UserPhoto, { id: 1, nonId: this.state.id })
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

  let LoguxUserPhoto: FC = () => {
    useSubscription(['users/1'], { context: MyContext })
    return h('div')
  }

  let Profile: FC = () => {
    return h(
      MyContext.Provider,
      { value: { store } },
      h('div', null, h(LoguxUserPhoto))
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
    constructor(props: {}) {
      super(props)
      this.state = { id: 1 }
    }

    change(id: number): void {
      this.setState({ id })
    }

    render(): ReactNode {
      return h(
        'div',
        { onClick: this.change.bind(this) },
        h(UserPhoto, { id: this.state.id, debounce: 250 })
      )
    }
  }

  let component = createComponent(h(Profile, {}))
  let nodeId = component.client.nodeId
  let log = component.client.log
  await delay(1)
  expect(childProps(component, 0).isSubscribing).toBe(true)
  act(() => {
    click(component, 1)
  })
  expect(childProps(component, 0).isSubscribing).toBe(true)
  act(() => {
    click(component, 2)
  })
  expect(childProps(component, 0).isSubscribing).toBe(true)
  await act(async () => {
    log.add({ type: 'logux/processed', id: `1 ${nodeId} 0` })
    await delay(1)
  })
  expect(childProps(component, 0).isSubscribing).toBe(true)
  await act(async () => {
    log.add({ type: 'logux/processed', id: `3 ${nodeId} 0` })
    await delay(1)
  })
  expect(childProps(component, 0).isSubscribing).toBe(false)
  act(() => {
    click(component, 3)
  })
  expect(childProps(component, 0).isSubscribing).toBe(false)
  await act(async () => {
    log.add({ type: 'logux/processed', id: `7 ${nodeId} 0` })
    await delay(1)
  })
  expect(childProps(component, 0).isSubscribing).toBe(false)
  act(() => {
    click(component, 4)
  })
  expect(childProps(component, 0).isSubscribing).toBe(false)
  act(() => {
    click(component, 5)
  })
  expect(childProps(component, 0).isSubscribing).toBe(false)
  await act(async () => {
    await delay(250)
  })
  expect(childProps(component, 0).isSubscribing).toBe(true)
  await act(async () => {
    log.add({ type: 'logux/processed', id: `10 ${nodeId} 0` })
    await delay(1)
  })
  expect(childProps(component, 0).isSubscribing).toBe(true)
  await act(async () => {
    log.add({ type: 'logux/processed', id: `12 ${nodeId} 0` })
    await delay(1)
  })
  expect(childProps(component, 0).isSubscribing).toBe(false)
})

it('works on channels size changes', () => {
  jest.spyOn(console, 'error')
  let UserList: FC<{ ids: number[] }> = ({ ids }) => {
    useSubscription(ids.map(id => `users/${id}`))
    return h('div')
  }

  class UsersPage extends Component<{}, { ids: number[] }> {
    constructor(props: {}) {
      super(props)
      this.state = { ids: [1] }
    }

    change(ids: number[]): void {
      this.setState({ ids })
    }

    render(): ReactNode {
      return h(
        'div',
        { onClick: this.change.bind(this) },
        h(UserList, { ids: this.state.ids })
      )
    }
  }

  let component = createComponent(h(UsersPage, {}))
  act(() => {
    click(component, [1, 2])
  })
  expect(console.error).not.toHaveBeenCalled()
})
