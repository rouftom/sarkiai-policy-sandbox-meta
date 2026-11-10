/**
 * better-auth entry point for the operator console (`@sps/auth/better-auth`).
 *
 * `createBetterAuth` builds the instance; the migration helpers in `./migrate`
 * plan the move from the legacy `operators` collection. `./service` implements
 * the live routes; see `docs/AUTH-BETTER-AUTH-MIGRATION.md`.
 */

export {
  createBetterAuth,
  ac,
  adminRole,
  operatorRole,
  ROLES,
  statement,
  type AuthMessage,
  type BetterAuthEvents,
  type BetterAuthInput,
  type BetterAuthInstance,
  type BetterAuthMailer,
} from './config.js'

export {
  legacyUserId,
  migrationWarnings,
  planOperatorMigration,
  planTwoFactor,
  type LegacyOperator,
  type OperatorMigrationPlan,
  type PlannedAccount,
  type PlannedTwoFactor,
  type PlannedUser,
} from './migrate.js'

export { BetterAuthService, type BetterAuthServiceConfig } from './service.js'
