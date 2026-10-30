import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import * as React from 'react'
import { BlocksWave, DEFAULT_STREAM_LOADER, STREAM_LOADERS, WindToy } from './stream-loaders'

describe('stream loaders', () => {
  test('three styles, blocks by default', () => {
    expect([...STREAM_LOADERS]).toEqual(['blocks', 'wind', 'cube'])
    expect(DEFAULT_STREAM_LOADER).toBe('blocks')
  })

  test('the block wave draws nine blocks with its own animation ids', () => {
    const markup = renderToStaticMarkup(
      React.createElement('div', null, React.createElement(BlocksWave), React.createElement(BlocksWave)),
    )
    const rects = markup.match(/<rect /g) ?? []
    expect(rects).toHaveLength(18)
    const ids = [...markup.matchAll(/<animate id="([^"]+)"/g)].map((match) => match[1])
    expect(ids).toHaveLength(4)
    expect(new Set(ids).size).toBe(4)
    expect(ids.every((id) => /^[a-zA-Z0-9]+$/.test(id ?? ''))).toBe(true)
  })

  test('the wind toy keeps its rotation', () => {
    const markup = renderToStaticMarkup(React.createElement(WindToy))
    expect(markup).toContain('attributeName="transform"')
    expect(markup).toContain('values="0 12 12;360 12 12"')
  })
})
