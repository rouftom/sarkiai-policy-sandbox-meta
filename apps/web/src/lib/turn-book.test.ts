import { describe, expect, test } from 'bun:test'
import { TurnBook } from './turn-book'

describe('TurnBook', () => {
  test('a finished turn cannot be changed by a late partial', () => {
    const book = new TurnBook()
    book.start(1)
    book.partial('bonjour')
    book.complete(1, 'Bonjour.')
    book.partial('bonjour')
    expect(book.text()).toBe('Bonjour.')
  })

  test('turns are ordered by id, and each appears once', () => {
    const book = new TurnBook()
    book.start(2)
    book.partial('la loi')
    book.complete(2, 'La loi sur le numérique.')
    book.start(1)
    book.complete(1, 'Bonjour.')
    expect(book.text()).toBe('Bonjour. La loi sur le numérique.')
  })

  test('the partial in progress is shown after the finished turns', () => {
    const book = new TurnBook()
    book.start(1)
    book.complete(1, 'Bonjour.')
    book.start(2)
    book.partial('comment')
    book.partial('comment ça marche')
    expect(book.text()).toBe('Bonjour. comment ça marche')
  })
})
