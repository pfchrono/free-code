import type { LocalCommandCall } from '../../types/command.js'
import { buildStatusSnapshot, renderStatusSnapshot } from './statusSnapshot.js'

export const call: LocalCommandCall = async (_args, context) => {
  const snapshot = await buildStatusSnapshot(context)

  return {
    type: 'text',
    value: renderStatusSnapshot(snapshot),
  }
}
