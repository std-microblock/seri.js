import type { BufferSerializer } from './types'

export const jsonBufferSerializer: BufferSerializer = {
  serialize(value: unknown): ArrayBufferLike {
    const encoder = new TextEncoder()
    const bytes = encoder.encode(JSON.stringify(value))
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  },
  deserialize(buffer: ArrayBufferLike): unknown {
    const decoder = new TextDecoder()
    const json = decoder.decode(new Uint8Array(buffer))
    return JSON.parse(json)
  },
}
