import type {HasQuery} from './Internal.ts'

export interface Emitter {
  emit(query: HasQuery): [string, Array<unknown>]
}
