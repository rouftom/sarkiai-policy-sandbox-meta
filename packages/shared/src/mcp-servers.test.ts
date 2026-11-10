import { describe, expect, test } from 'bun:test'
import { parseMcpServers } from './mcp-servers'

describe('parseMcpServers', () => {
  test('an unset or empty value yields no servers', () => {
    expect(parseMcpServers(undefined)).toEqual([])
    expect(parseMcpServers(null)).toEqual([])
    expect(parseMcpServers('')).toEqual([])
    expect(parseMcpServers('   ')).toEqual([])
  })

  test('keeps the name, url and key requirement', () => {
    const servers = parseMcpServers(
      JSON.stringify([
        { name: 'sarkiai_charts', url: 'https://charts.example/mcp', requiresApiKey: true },
        { name: 'open_lookup', url: 'http://localhost:8010/mcp', requiresApiKey: false },
      ]),
    )
    expect(servers).toEqual([
      { name: 'sarkiai_charts', url: 'https://charts.example/mcp', requiresApiKey: true },
      { name: 'open_lookup', url: 'http://localhost:8010/mcp', requiresApiKey: false },
    ])
  })

  test('a key-protected server is the default', () => {
    const [server] = parseMcpServers('[{"name":"sea_mcp_docx","url":"https://docs.example/mcp"}]')
    expect(server?.requiresApiKey).toBe(true)
  })

  test('trims the entries', () => {
    const [server] = parseMcpServers('[{"name":" charts ","url":" https://charts.example/mcp "}]')
    expect(server).toMatchObject({ name: 'charts', url: 'https://charts.example/mcp' })
  })

  test('a malformed value fails loudly instead of yielding an empty registry', () => {
    expect(() => parseMcpServers('not json')).toThrow('not valid JSON')
    expect(() => parseMcpServers('{"name":"charts"}')).toThrow('must be a JSON array')
    expect(() => parseMcpServers('[{"url":"https://charts.example/mcp"}]')).toThrow('has no name')
    expect(() => parseMcpServers('[{"name":"charts"}]')).toThrow('has no url')
    expect(() => parseMcpServers('[{"name":"charts","url":"ftp://charts.example"}]')).toThrow('must use http or https')
    expect(() => parseMcpServers('[{"name":"charts","url":"not a url"}]')).toThrow('invalid url')
  })

  test('refuses a duplicate name, which would make resolution ambiguous', () => {
    expect(() =>
      parseMcpServers(
        '[{"name":"charts","url":"https://a.example/mcp"},{"name":"charts","url":"https://b.example/mcp"}]',
      ),
    ).toThrow('listed twice')
  })
})
