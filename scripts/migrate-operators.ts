#!/usr/bin/env bun
/**
 * One-off migration from the legacy `operators` collection to better-auth.
 *
 *   bun run auth:migrate --dry-run   # list the plan and the warnings
 *   bun run auth:migrate             # write user -> account -> twoFactor
 *
 * Run it once against the production database *before* the API starts serving
 * with better-auth: better-auth reads `user`, and an empty `user` collection
 * makes `/v1/auth/setup` public again.
 *
 * The operation is idempotent. A re-run skips a `user` that already carries the
 * same e-mail and an `account` that already carries the same password hash; it
 * never rewrites a different password, and it never replaces an existing
 * `twoFactor` row. Recovery codes are not imported: the legacy store keeps only
 * their SHA-256 digests, and better-auth compares codes in clear text.
 */

import { createHash } from 'node:crypto'
import { MongoClient, type Collection, type Document, type ClientSession } from 'mongodb'
import {
  migrationWarnings,
  planOperatorMigration,
  planTwoFactor,
  type LegacyOperator,
} from '@sps/auth/better-auth'

const uri = process.env.MONGODB_URI
const dbName = process.env.MONGODB_DB_NAME ?? 'policy_sandbox'
const dryRun = process.argv.includes('--dry-run')

if (!uri) {
  console.error('MONGODB_URI is not set; refusing to guess a cluster.')
  process.exit(1)
}

/**
 * The same derivation `apps/api/src/auth.ts` uses: better-auth needs a key of
 * at least 32 characters, and a short legacy secret is hashed rather than
 * replaced, so the encrypted TOTP material stays readable after the cut-over.
 */
function betterAuthSecret(): string {
  const configured = process.env.BETTER_AUTH_SECRET
  const material = configured || process.env.SESSION_SECRET || process.env.APPROVAL_SECRET
  if (!material) {
    console.error('BETTER_AUTH_SECRET (or SESSION_SECRET) is not set; it encrypts the TOTP material.')
    process.exit(1)
  }
  if (material.length >= 32) return material
  return createHash('sha256').update(material).digest('hex')
}

const secret = betterAuthSecret()
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 })
await client.connect()
const db = client.db(dbName)

interface Store {
  users: Collection<Document>
  accounts: Collection<Document>
  twoFactors: Collection<Document>
  session?: ClientSession
}

interface Counters {
  created: number
  skipped: number
  refused: number
}

const counters: Counters = { created: 0, skipped: 0, refused: 0 }
const warnings: string[] = []
const refusals: string[] = []

const store: Store = {
  users: db.collection<Document>('user'),
  accounts: db.collection<Document>('account'),
  twoFactors: db.collection<Document>('twoFactor'),
}

function options(session?: ClientSession) {
  return session ? { session } : {}
}

/**
 * Write one operator. The three documents are independent writes; the caller
 * runs them in a transaction when the server supports one.
 */
async function applyOperator(
  operator: LegacyOperator,
  target: Store,
  { checkOnly = false }: { checkOnly?: boolean } = {},
): Promise<void> {
  const { session } = target
  const plan = planOperatorMigration(operator)
  const twoFactor = await planTwoFactor(operator, secret)

  const byEmail = await target.users.findOne({ email: plan.user.email }, options(session))
  if (byEmail && byEmail._id !== plan.user.id) {
    throw new Error(
      `user already exists for ${operator.email} with id ${String(byEmail._id)} (expected ${plan.user.id})`,
    )
  }

  const existingAccount = await target.accounts.findOne({ _id: plan.account.id }, options(session))
  if (existingAccount && existingAccount.password !== plan.account.password) {
    throw new Error(`account already exists for ${operator.email} with a different password hash`)
  }

  if (checkOnly) {
    counters.created += 1
    return
  }

  const existingUser = await target.users.findOne({ _id: plan.user.id }, options(session))
  if (!existingUser) {
    await target.users.insertOne({ ...plan.user, _id: plan.user.id }, options(session))
    counters.created += 1
  } else {
    counters.skipped += 1
  }

  if (!existingAccount) {
    await target.accounts.insertOne({ ...plan.account, _id: plan.account.id }, options(session))
  }

  if (twoFactor) {
    // `symmetricEncrypt` is randomized, so a re-run cannot compare ciphertexts.
    // An existing row already holds the enrolment: leave it untouched.
    const existingTwoFactor = await target.twoFactors.findOne(
      { _id: twoFactor.id },
      options(session),
    )
    if (!existingTwoFactor) {
      await target.twoFactors.insertOne({ ...twoFactor, _id: twoFactor.id }, options(session))
    }
  }
}

/** A standalone `mongod` refuses transactions; that is a supported install. */
function transactionsUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /Transaction numbers are only allowed|replica set member or mongos|Transaction API/i.test(
    message,
  )
}

async function supportsTransactions(): Promise<boolean> {
  const probe = client.startSession()
  try {
    await probe.withTransaction(async () => {
      await db.collection('operators').findOne({}, { session: probe })
    })
    return true
  } catch (error) {
    if (!transactionsUnavailable(error)) throw error
    console.warn('  transactions unavailable on this server · writing without one')
    return false
  } finally {
    await probe.endSession()
  }
}

const operators = (await db
  .collection<Document>('operators')
  .find({})
  .toArray()) as unknown as LegacyOperator[]

console.log(
  `Operator migration · db=${dbName} operators=${operators.length}${dryRun ? ' (dry run)' : ''}`,
)

const transactional = !dryRun && (await supportsTransactions())

for (const operator of operators) {
  warnings.push(...migrationWarnings(operator))
  try {
    if (dryRun) {
      await applyOperator(operator, store, { checkOnly: true })
    } else if (transactional) {
      const session = client.startSession()
      try {
        await session.withTransaction(async () => applyOperator(operator, { ...store, session }))
      } finally {
        await session.endSession()
      }
    } else {
      await applyOperator(operator, store)
    }
  } catch (error) {
    counters.refused += 1
    refusals.push(`${operator.email}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

if (warnings.length) {
  console.log(`  warnings=${warnings.length}`)
  for (const warning of warnings) console.log(`  - ${warning}`)
}
if (refusals.length) {
  console.log(`  refused=${refusals.length}`)
  for (const refusal of refusals) console.log(`  ! ${refusal}`)
}
console.log(
  `  ${dryRun ? 'planned' : 'created'}=${counters.created} skipped=${counters.skipped} refused=${counters.refused}`,
)
if (!dryRun) {
  console.log(
    `  users=${await store.users.countDocuments()} accounts=${await store.accounts.countDocuments()} twoFactor=${await store.twoFactors.countDocuments()}`,
  )
}

await client.close()
if (refusals.length) process.exitCode = 1
