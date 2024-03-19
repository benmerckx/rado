import {HasQuery} from './Meta.ts'

export interface Emitter {
  emit(query: HasQuery): [string, Array<unknown>]
}
