import type { WireSerializer } from './types'

export const jsonStringSerializer: WireSerializer<string> = {
  serialize(value: unknown): string {
    return JSON.stringify(value)
  },
  deserialize(buffer: string): unknown {
    return JSON.parse(buffer)
  },
}
