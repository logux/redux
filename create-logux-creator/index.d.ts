import { ClientMeta, ClientOptions, CrossTabClient } from '@logux/client'
import { Log } from '@logux/core'

import {
  LoguxStoreCreator,
  LoguxReduxOptions
} from '../create-store-creator/index.js'

/**
 * @deprecated Use createStoreCreator(client, opts) instead.
 */
export function createLoguxCreator<
  H extends object = {},
  L extends Log = Log<ClientMeta>
> (
  config: ClientOptions & LoguxReduxOptions
): LoguxStoreCreator<L, CrossTabClient<H, L>>
