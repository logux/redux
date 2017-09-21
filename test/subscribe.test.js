var createLoguxCreator = require('logux-redux/create-logux-creator')
var createReactClass = require('create-react-class')
var Provider = require('react-redux').Provider
var renderer = require('react-test-renderer')
var React = require('react')

var subscribe = require('../subscribe')

var h = React.createElement

function createComponent (content) {
  var createStore = createLoguxCreator({
    subprotocol: '0.0.0',
    server: 'wss://localhost:1337',
    userId: false
  })
  var store = createStore(function () {
    return { }
  })
  var component = renderer.create(h(Provider, { store: store }, content))
  component.client = store.client
  return component
}

function UserPhoto (props) {
  return h('img', { src: props.id + '.jpg' })
}
var SubscribeUserPhoto = subscribe(function (props) {
  return { channel: 'users/' + props.id, fields: ['photo'] }
})(UserPhoto)

it('generates component name', function () {
  var User5 = createReactClass({
    displayName: 'User5',
    render: function () { }
  })
  var SubscribeUser5 = subscribe(function () {
    return 'users/10'
  })(User5)
  expect(SubscribeUser5.displayName).toEqual('SubscribeUser5')

  // eslint-disable-next-line es5/no-classes
  class User6 extends React.Component {
    render () { }
  }
  var SubscribeUser6 = subscribe(function () {
    return 'users/10'
  })(User6)
  expect(SubscribeUser6.displayName).toEqual('SubscribeUser6')

  var SubscribeNameless = subscribe(function () {
    return 'users/10'
  })(function () { })
  expect(SubscribeNameless.displayName).toEqual('SubscribeComponent')
})

it('passes properties', function () {
  var Post = createReactClass({
    render: function () {
      return h('article', { },
        h('h1', { }, this.props.title),
        this.props.children)
    }
  })
  var SubscribePost = subscribe(function () {
    return 'posts/10'
  })(Post)

  var component = createComponent(
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

it('subscribes', function () {
  function User () {
    return null
  }
  var SubscribeUser = subscribe(function (props) {
    return 'users/' + props.id
  })(User)

  var component = createComponent(h('div', { }, [
    h(SubscribeUser, { id: '1', key: 1 }),
    h(SubscribeUser, { id: '1', key: 2 }),
    h(SubscribeUser, { id: '2', key: 3 })
  ]))
  expect(component.client.subscriptions).toEqual([
    { type: 'logux/subscribe', channel: 'users/1' },
    { type: 'logux/subscribe', channel: 'users/2' }
  ])
})

it('unsubscribes', function () {
  var UserList = createReactClass({
    getInitialState: function () {
      return {
        users: { a: 1, b: 1, c: 2 }
      }
    },
    change: function (users) {
      this.setState({ users: users })
    },
    render: function () {
      var users = this.state.users
      return h('div', {
        onClick: this.change
      }, Object.keys(this.state.users).map(function (key) {
        return h(SubscribeUserPhoto, { id: users[key], key: key })
      }))
    }
  })

  var component = createComponent(h(UserList, { }))
  expect(component.client.subscriptions).toEqual([
    { type: 'logux/subscribe', channel: 'users/1', fields: ['photo'] },
    { type: 'logux/subscribe', channel: 'users/2', fields: ['photo'] }
  ])

  component.toJSON().props.onClick([1, 2])
  expect(component.client.subscriptions).toEqual([
    { type: 'logux/subscribe', channel: 'users/1', fields: ['photo'] },
    { type: 'logux/subscribe', channel: 'users/2', fields: ['photo'] }
  ])

  component.toJSON().props.onClick({ a: 1 })
  expect(component.client.subscriptions).toEqual([
    { type: 'logux/subscribe', channel: 'users/1', fields: ['photo'] }
  ])
})

it('changes subscription', function () {
  var Profile = createReactClass({
    getInitialState: function () {
      return {
        id: 1
      }
    },
    change: function (id) {
      this.setState({ id: id })
    },
    render: function () {
      return h('div', { onClick: this.change },
        h(SubscribeUserPhoto, { id: this.state.id })
      )
    }
  })

  var component = createComponent(h(Profile, { }))
  expect(component.client.subscriptions).toEqual([
    { type: 'logux/subscribe', channel: 'users/1', fields: ['photo'] }
  ])

  component.toJSON().props.onClick(2)
  expect(component.client.subscriptions).toEqual([
    { type: 'logux/subscribe', channel: 'users/2', fields: ['photo'] }
  ])
})

it('supports multiple channels', function () {
  function User () {
    return null
  }
  var SubscribeUser = subscribe(function (props) {
    return ['users/' + props.id, 'pictures/' + props.id]
  })(User)

  var component = createComponent(h('div', { }, [
    h(SubscribeUser, { id: '1', key: 1 }),
    h(SubscribeUser, { id: '1', key: 2 }),
    h(SubscribeUser, { id: '2', key: 3 })
  ]))
  expect(component.client.subscriptions).toEqual([
    { type: 'logux/subscribe', channel: 'users/1' },
    { type: 'logux/subscribe', channel: 'pictures/1' },
    { type: 'logux/subscribe', channel: 'users/2' },
    { type: 'logux/subscribe', channel: 'pictures/2' }
  ])
})

it('supports differnt store sources', function () {
  var LoguxUserPhoto = subscribe(function (props) {
    return 'users/' + props.id
  }, {
    storeKey: 'logux'
  })(UserPhoto)

  var createStore = createLoguxCreator({
    subprotocol: '0.0.0',
    server: 'wss://localhost:1337',
    userId: false
  })
  var store = createStore(function () {
    return { }
  })

  var Profile = createReactClass({
    childContextTypes: {
      logux: function () { }
    },
    getChildContext: function () {
      return { logux: store }
    },
    render: function () {
      return h('div', { onClick: this.change },
        h(LoguxUserPhoto, { id: 1 })
      )
    }
  })

  createComponent(h(Profile, { }))
  expect(store.client.subscriptions).toEqual([
    { type: 'logux/subscribe', channel: 'users/1' }
  ])
})
