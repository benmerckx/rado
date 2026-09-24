export interface CachedStatement<Statement> {
  statement: Statement
  users: number
  evicted: boolean
}

// Reused statements can report stale result columns after the schema changed
const changesSchema = /^\s*(create|drop|alter|attach|detach|rollback)\b/i

// Reuses native statements by sql text. A statement is finalized once it is
// evicted and no longer in use.
export class StatementCache<Statement> {
  #statements = new Map<string, CachedStatement<Statement>>()
  #prepare: (sql: string) => Statement
  #finalize: (statement: Statement) => void
  #size: number

  constructor(
    prepare: (sql: string) => Statement,
    finalize: (statement: Statement) => void,
    size = 256
  ) {
    this.#prepare = prepare
    this.#finalize = finalize
    this.#size = size
  }

  acquire(sql: string): CachedStatement<Statement> {
    if (changesSchema.test(sql)) {
      this.clear()
      return {statement: this.#prepare(sql), users: 1, evicted: true}
    }
    let cached = this.#statements.get(sql)
    if (cached) {
      // Map keeps insertion order, re-inserting marks it most recently used
      this.#statements.delete(sql)
    } else {
      cached = {statement: this.#prepare(sql), users: 0, evicted: false}
      if (this.#statements.size >= this.#size) {
        const [oldest, entry] = this.#statements.entries().next().value!
        this.#statements.delete(oldest)
        this.#evict(entry)
      }
    }
    this.#statements.set(sql, cached)
    cached.users++
    return cached
  }

  release(cached: CachedStatement<Statement>): void {
    cached.users--
    if (cached.evicted && cached.users === 0) this.#finalize(cached.statement)
  }

  invalidate(sql: string): void {
    if (changesSchema.test(sql)) this.clear()
  }

  clear(): void {
    for (const cached of this.#statements.values()) this.#evict(cached)
    this.#statements.clear()
  }

  #evict(cached: CachedStatement<Statement>): void {
    cached.evicted = true
    if (cached.users === 0) this.#finalize(cached.statement)
  }
}

// Driver statements hold a cached statement until they are freed
export class ReusedStatement<Statement> {
  protected stmt: Statement
  #statements: StatementCache<Statement>
  #cached: CachedStatement<Statement> | undefined

  constructor(statements: StatementCache<Statement>, sql: string) {
    this.#statements = statements
    this.#cached = statements.acquire(sql)
    this.stmt = this.#cached.statement
  }

  free(): void {
    if (!this.#cached) return
    this.#statements.release(this.#cached)
    this.#cached = undefined
  }
}
