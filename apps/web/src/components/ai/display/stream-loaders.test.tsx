import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import * as React from 'react'
import { BlocksWave, DEFAULT_STREAM_LOADER, NeuralMesh, STREAM_LOADERS, WindToy } from './stream-loaders'

describe('stream loaders', () => {
  test('three styles, blocks by default', () => {
    expect([...STREAM_LOADERS]).toEqual(['blocks', 'wind', 'neural'])
    expect(DEFAULT_STREAM_LOADER).toBe('blocks')
  })

  test('the block wave draws nine blocks with its own animation ids', () => {
    const markup = renderToStaticMarkup(
      React.createElement('div', null, React.createElement(BlocksWave), React.createElement(BlocksWave)),
    )
    expect(markup.match(/<rect /g) ?? []).toHaveLength(18)
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

  test('the neural mesh has ten nodes, its links and travelling signals', () => {
    const markup = renderToStaticMarkup(React.createElement(NeuralMesh))
    expect(markup).toContain('<title>neural-mesh</title>')
    expect(markup.match(/<line /g) ?? []).toHaveLength(24)
    expect(markup.match(/<animateMotion /g) ?? []).toHaveLength(6)
    // 3 + 4 + 3 nodes plus 6 signals
    expect(markup.match(/<circle /g) ?? []).toHaveLength(16)
  })
})
