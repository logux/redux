import { CrossTabClient } from '@logux/client'

import { createStoreCreator } from '../create-store-creator/index.js'

export function createLoguxCreator(config = {}) {
  console.warn(
    'createLoguxCreator() will be removed in v0.9. ' +
      'Use createStoreCreator(client, opts) instead.'
  )

  let cleanEvery = config.cleanEvery || 25
  delete config.cleanEvery
  let saveStateEvery = config.saveStateEvery || 50
  delete config.saveStateEvery
  let onMissedHistory = config.onMissedHistory
  delete config.onMissedHistory
  let reasonlessHistory = config.reasonlessHistory || 1000
  delete config.reasonlessHistory

  let client = new CrossTabClient(config)

  return createStoreCreator(client, {
    cleanEvery,
    saveStateEvery,
    onMissedHistory,
    reasonlessHistory
  })
}
