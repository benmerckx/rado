export type Id<T> = T extends {id: any} ? T['id'] : never
