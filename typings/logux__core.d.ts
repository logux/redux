import { Emitter } from 'nanoevents'

declare module '@logux/core' {
  interface Connection {
    emitter: Emitter
  }
}
