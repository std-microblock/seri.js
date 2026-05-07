import { makeSeri } from './factory'

const defaultApi = makeSeri()
const seri = defaultApi.seri
const to = defaultApi.to
const from = defaultApi.from
const toPlain = defaultApi.toPlain
const fromPlain = defaultApi.fromPlain

export default seri
export { from, fromPlain, makeSeri, seri, to, toPlain }
export { defaultHash } from './hash'
export { jsonStringSerializer } from './serializer'
export {
  SeriDuplicateNameError,
  SeriTagCollisionError,
  SeriTypeMismatchError,
  SeriUnknownReferenceError,
  SeriUnknownTagError,
  SeriUnsupportedValueError,
} from './errors'
export type {
  Constructor,
  FieldCodec,
  SeriApi,
  SeriClassOptions,
  SeriDecorator,
  SeriFactoryOptions,
  SeriInstance,
  WireSerializer,
} from './types'
