#!/usr/bin/env bun
/**
 * Provider smoke check · answers "which model is answering, and does it work?"
 * before a demo, for each of the three modes.
 *
 *   bun run check:provider                 # the mode selected by SANDBOX_MODE
 *   bun run check:provider cloud           # Meta Model API
 *   bun run check:provider sovereign       # Muse Glimmer on Ollama
 *
 * It prints the descriptor (never a key), one short answer, the token usage and
 * the latency, then exits non-zero if the mode is not configured or the call
 * fails. Cost of a cloud run: a few thousandths of a cent.
 */

import { generateText } from 'ai'
import { createModel, providerApiKey, resolveProvider } from '@sps/agents'
import type { ProviderMode } from '@sps/shared'

const requested = process.argv[2] as ProviderMode | undefined
const provider = resolveProvider(process.env, requested)

const secret = providerApiKey(provider)
// Local modes use the placeholder "ollama" as key: only real secrets are scrubbed.
const realSecret = Boolean(secret) && secret.length >= 12 && secret !== 'ollama'
const redact = (value: string) => (realSecret ? value.split(secret).join('[REDACTED]') : value)

console.log(`mode      : ${provider.mode}`)
console.log(`served by : ${provider.servedBy}`)
console.log(`endpoint  : ${provider.baseURL}`)
console.log(`model     : ${provider.models.reasoning}`)
console.log(`vision    : ${provider.models.vision}`)
if (provider.models.segmentation) console.log(`sam       : ${provider.models.segmentation}`)
if (provider.models.transcription) console.log(`speech    : ${provider.models.transcription}`)
console.log(`residency : ${provider.residency}`)
console.log(`budget    : $${provider.budgetUsd.toFixed(2)} / run`)
console.log(`ready     : ${provider.ready}${provider.reason ? ` (${provider.reason})` : ''}`)

if (realSecret && JSON.stringify(provider).includes(secret)) {
  console.error('\nFAIL: the descriptor leaks the API key.')
  process.exit(1)
}
if (!provider.ready) {
  console.error('\nNot configured · nothing was sent.')
  process.exit(1)
}

const question =
  'In one sentence: a hospital discovers a patient-data leak. Under the applicable law, who must be notified?'

const started = Date.now()
try {
  const { text, reasoning, usage, finishReason } = await generateText({
    model: createModel({ provider }),
    prompt: question,
    // Reasoning models spend output tokens thinking *before* answering:
    // muse-spark-1.3 routinely burns 600–1500 of them, so a tight cap returns
    // finishReason "length" with empty text. The ceiling is not billed.
    maxOutputTokens: 4096,
  })
  const ms = Date.now() - started

  console.log(`\nQ: ${question}`)
  console.log(`A: ${redact(text.trim())}`)
  console.log(
    `\ntokens    : in ${usage.inputTokens ?? '?'} · out ${usage.outputTokens ?? '?'} · total ${usage.totalTokens ?? '?'}`,
  )
  console.log(`latency   : ${ms} ms`)
  console.log(`finish    : ${finishReason}`)
  console.log(`reasoning : ${(reasoning ?? []).map((part) => part.text).join(' ').trim().length} chars`)
  if (provider.budgetUsd > 0) {
    // Meta Model API list price for muse-spark-1.3: $1.25/M in, $4.25/M out.
    const cost = ((usage.inputTokens ?? 0) * 1.25 + (usage.outputTokens ?? 0) * 4.25) / 1_000_000
    console.log(`est. cost : $${cost.toFixed(6)}`)
  }
  if (!text.trim()) {
    console.error(
      finishReason === 'length'
        ? '\nFAIL: empty answer · the output cap was consumed by reasoning tokens.'
        : '\nFAIL: empty answer.',
    )
    process.exit(1)
  }
} catch (error) {
  console.error(`\nFAIL: ${provider.servedBy} at ${provider.baseURL} · ${redact((error as Error).message)}`)
  process.exit(1)
}
