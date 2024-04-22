import {Query, QueryData} from './Query.js'

export function sql<T>(
  strings: TemplateStringsArray,
  ...params: Array<unknown>
): Query<T> {
  return new Query(new QueryData.Raw({strings, params}))
}

export namespace sql {
  export function all<T = unknown>(
    strings: TemplateStringsArray,
    ...params: Array<unknown>
  ): Query<Array<T>> {
    return new Query(
      new QueryData.Raw({strings, params, expectedReturn: 'rows'})
    )
  }
  export function get<T = unknown>(
    strings: TemplateStringsArray,
    ...params: Array<unknown>
  ): Query<T> {
    return new Query(
      new QueryData.Raw({strings, params, expectedReturn: 'row'})
    )
  }
}
