/**
 * The shared validation answer: a stable code, a human message and the
 * offending fields beside `error` — never nested under it.
 */

import { describe, expect, test } from 'bun:test'
import Fastify from 'fastify'
import { z } from 'zod'
import { validationFailure } from './http-errors.js'

async function buildApp() {
  const app = Fastify({ logger: false })
  app.post('/field', async (request, reply) => {
    const parsed = z.object({ country: z.string().min(2) }).safeParse(request.body)
    if (!parsed.success) return validationFailure(reply, parsed.error)
    return parsed.data
  })
  app.post('/form', async (request, reply) => {
    const parsed = z.string().min(3).safeParse(request.body)
    if (!parsed.success) return validationFailure(reply, parsed.error)
    return { value: parsed.data }
  })
  await app.ready()
  return app
}

describe('validationFailure', () => {
  test('answers 400 with the code, the message and the field messages', async () => {
    const app = await buildApp()
    const response = await app.inject({ method: 'POST', url: '/field', payload: { country: 'c' } })
    expect(response.statusCode).toBe(400)
    const body = response.json()
    expect(body.error).toBe('validation_failed')
    expect(body.message).toBe('The request does not match the expected schema.')
    expect(body.fields.country[0]).toContain('Too small')
    expect(body.fieldErrors).toBeUndefined()
    await app.close()
  })

  test('puts a whole-value failure in formErrors, not in fields', async () => {
    const app = await buildApp()
    const response = await app.inject({
      method: 'POST',
      url: '/form',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify('ab'),
    })
    expect(response.statusCode).toBe(400)
    const body = response.json()
    expect(body.error).toBe('validation_failed')
    expect(body.formErrors[0]).toContain('Too small')
    expect(body.fields).toBeUndefined()
    await app.close()
  })

  test('keeps error a string so one parser handles every failure', async () => {
    const app = await buildApp()
    const response = await app.inject({ method: 'POST', url: '/field', payload: { country: 'c' } })
    expect(typeof response.json().error).toBe('string')
    await app.close()
  })
})
