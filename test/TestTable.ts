import {test} from 'uvu'
import * as assert from 'uvu/assert'
import {Table, column, index, table} from '../src/index.js'

const Notification = table({
  Notification: class {
    id = column.string().primaryKey<'Notification'>()
    shortCode = column.string()
    language = column.string()
    feedLink = column.string()
    feedItem = column.string()
    feedItemNotification = column.string()
    surveys = column.array()
    sendAt = column.string()
    sentAt = column.string().nullable()
    completed = column.boolean().default(false)
    completedAt = column.string().nullable()

    protected [table.meta]() {
      return {
        indexes: {
          key: index(this.feedLink, this.feedItem, this.feedItemNotification),
          feedLink: index(this.feedLink),
          feedItem: index(this.feedItem),
          sendAt: index(this.sendAt),
          sentAt: index(this.sentAt),
          completed: index(this.completed),
          completedAt: index(this.completedAt)
        }
      }
    }
  }
})

const Table1 = table({
  Table1_test: {
    id: column.integer().primaryKey<'Table1'>()
  }
})

const Table2 = table({
  Table2_test: {
    id: column.integer().primaryKey<'Table2'>(),
    name: column.string(),
    length: column.integer()
  }
})

const Table3 = table({
  Table3_test: {
    name: column.string()
  }
})

test('Available metadata', async () => {
  assert.is(Table1[Table.Data].name, 'Table1_test')
  assert.is(Table2[Table.Data].name, 'Table2_test')
  assert.equal(
    {...Table2},
    {id: Table2.id, name: Table2.name, length: Table2.length}
  )
  assert.equal({...Table3}, {name: Table2.name})
  assert.equal(
    {...Notification},
    {
      id: Notification.id,
      shortCode: Notification.shortCode,
      language: Notification.language,
      feedLink: Notification.feedLink,
      feedItem: Notification.feedItem,
      feedItemNotification: Notification.feedItemNotification,
      surveys: Notification.surveys,
      sendAt: Notification.sendAt,
      sentAt: Notification.sentAt,
      completed: Notification.completed,
      completedAt: Notification.completedAt
    }
  )
})

test.run()
