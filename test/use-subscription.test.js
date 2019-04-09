var createReactClass = require('create-react-class')
var createContext = require('react').createContext
var Provider = require('react-redux').Provider
var TestTime = require('@logux/core').TestTime
var renderer = require('react-test-renderer')
var h = require('react').createElement

var createLoguxCreator = require('../create-logux-creator')
var useSubscription = require('../use-subscription')

jest.mock('react', function () {
  var React = require('react/cjs/react.development.js')
  React.useEffect = React.useLayoutEffect
  return React
})

function createComponent (content) {
  var createStore = createLoguxCreator({
    subprotocol: '0.0.0',
    server: 'wss://localhost:1337',
    userId: false,
    time: new TestTime()
  })
  var store = createStore(function () {
    return { }
  })
  var component = renderer.create(h(Provider, { store: store }, content))
  component.client = store.client
  return component
}

function UserPhoto (props) {
  var isSubscribing = useSubscription([
    { channel: 'users/' + props.id, fields: ['photo'] }
  ])
  return h('img', {
    isSubscribing: isSubscribing,
    src: props.id + '.jpg'
  })
}

it('subscribes', function () {
  var component = createComponent(h('div', { }, [
    h(UserPhoto, { id: '1', key: 1 }),
    h(UserPhoto, { id: '1', key: 2 }),
    h(UserPhoto, { id: '2', key: 3 })
  ]))
  return Promise.resolve().then(function () {
    expect(component.client.subscriptions).toEqual({
      '{"type":"logux/subscribe","channel":"users/1","fields":["photo"]}': 1,
      '{"type":"logux/subscribe","channel":"users/2","fields":["photo"]}': 1
    })
  })
})

it('accepts channel names', function () {
  function User (props) {
    useSubscription(['users/' + props.id, 'users/' + props.id + '/comments'])
    return h('div')
  }
  var component = createComponent(h('div', { }, [
    h(User, { id: '1', key: 1 })
  ]))
  return Promise.resolve().then(function () {
    expect(component.client.subscriptions).toEqual({
      '{"type":"logux/subscribe","channel":"users/1"}': 1,
      '{"type":"logux/subscribe","channel":"users/1/comments"}': 1
    })
  })
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
        return h(UserPhoto, { id: users[key], key: key })
      }))
    }
  })

  var component = createComponent(h(UserList, { }))
  return Promise.resolve().then(function () {
    expect(component.client.subscriptions).toEqual({
      '{"type":"logux/subscribe","channel":"users/1","fields":["photo"]}': 1,
      '{"type":"logux/subscribe","channel":"users/2","fields":["photo"]}': 1
    })
    component.toJSON().props.onClick([1, 2])
    return Promise.resolve()
  }).then(function () {
    expect(component.client.subscriptions).toEqual({
      '{"type":"logux/subscribe","channel":"users/1","fields":["photo"]}': 1,
      '{"type":"logux/subscribe","channel":"users/2","fields":["photo"]}': 1
    })
    component.toJSON().props.onClick({ a: 1 })
    return Promise.resolve()
  }).then(function () {
    expect(component.client.subscriptions).toEqual({
      '{"type":"logux/subscribe","channel":"users/1","fields":["photo"]}': 1
    })
  })
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
        h(UserPhoto, { id: this.state.id })
      )
    }
  })

  var component = createComponent(h(Profile, { }))
  return Promise.resolve().then(function () {
    expect(component.client.subscriptions).toEqual({
      '{"type":"logux/subscribe","channel":"users/1","fields":["photo"]}': 1
    })
    component.toJSON().props.onClick(2)
    return Promise.resolve()
  }).then(function () {
    expect(component.client.subscriptions).toEqual({
      '{"type":"logux/subscribe","channel":"users/2","fields":["photo"]}': 1
    })
  })
})

it('does not resubscribe on non-relevant props changes', function () {
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
        h(UserPhoto, { id: 1, nonId: this.state.id })
      )
    }
  })

  var component = createComponent(h(Profile, { }))

  var resubscriptions = 0
  component.client.log.on('add', function () {
    resubscriptions += 1
  })

  component.toJSON().props.onClick(2)
  expect(resubscriptions).toEqual(0)
})

it('supports different store sources', function () {
  var MyContext = createContext()

  function LoguxUserPhoto () {
    useSubscription(['users/1'], { context: MyContext })
    return h('div')
  }

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
      return h(Provider, { context: MyContext, store: store },
        h('div', { onClick: this.change },
          h(LoguxUserPhoto, { id: 1 })
        )
      )
    }
  })

  createComponent(h(Profile, { }))
  return Promise.resolve().then(function () {
    expect(store.client.subscriptions).toEqual({
      '{"type":"logux/subscribe","channel":"users/1"}': 1
    })
  })
})

it('reports about subscription end', function () {
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
        h(UserPhoto, { id: this.state.id })
      )
    }
  })

  var component = createComponent(h(Profile, { }))
  var nodeId = component.client.nodeId
  var log = component.client.log
  return Promise.resolve().then(function () {
    expect(component.toJSON().children[0].props.isSubscribing).toBeTruthy()
    renderer.act(function () {
      component.toJSON().props.onClick(1)
    })
    return Promise.resolve()
  }).then(function () {
    expect(component.toJSON().children[0].props.isSubscribing).toBeTruthy()
    renderer.act(function () {
      component.toJSON().props.onClick(2)
    })
    return Promise.resolve()
  }).then(function () {
    expect(component.toJSON().children[0].props.isSubscribing).toBeTruthy()
    log.add({ type: 'logux/processed', id: '1 ' + nodeId + ' 0' })
    return Promise.resolve()
  }).then(function () {
    expect(component.toJSON().children[0].props.isSubscribing).toBeTruthy()
    log.add({ type: 'logux/processed', id: '3 ' + nodeId + ' 0' })
    return Promise.resolve()
  }).then(function () {
    expect(component.toJSON().children[0].props.isSubscribing).toBeFalsy()
  })
})
