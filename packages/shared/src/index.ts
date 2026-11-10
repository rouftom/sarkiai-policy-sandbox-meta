export * from './types'
export * from './rights'
export * from './workflows'
export * from './agents'
export * from './coordination'
export * from './mongo'
export * from './registry'

// The MCP server registry lives behind its own entry point
// (`@sps/shared/mcp-servers`): the console needs the parser at module load and
// must not pull the whole shared barrel into that chunk.
