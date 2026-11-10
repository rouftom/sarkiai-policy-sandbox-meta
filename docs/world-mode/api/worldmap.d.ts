/**
 * @sps/worldmap and @sps/world: public contract (v0.2, specification draft).
 * Design contract only: shapes and signatures, no implementation.
 * Reused repository types are referenced by name and re-declared here only as
 * minimal structural mirrors so this file type-checks on its own; in the
 * repository they are imported from '@sps/shared' and '@sps/readiness'.
 * Licence: Apache-2.0.
 */

/* ------------------------------------------------------------------ */
/* 1. Identifiers and base types                                       */
/* ------------------------------------------------------------------ */

/** ISO 3166-1 alpha-2 in UPPER case, as used by geometry ("CM"). */
export type GeoCountryId = string;
/** ISO 3166-2, e.g. "CM-OU", or "X-<ISO2>-<slug>" when no ISO code exists. */
export type RegionId = string;
export type EntityId = GeoCountryId | RegionId;
/** Registry country code, ISO 3166-1 alpha-2 in lower case ("cm"), as in CountryRecord.code. */
export type RegistryCode = string;
export type Locale = 'fr' | 'en' | (string & {});
export type ISODateTime = string;
export type Hash = string; // sha256 hex

export type Localized = Record<Locale, string>;
export type BBox = readonly [x0: number, y0: number, x1: number, y1: number];
export type Point = readonly [x: number, y: number];

export type EntityKind = 'country' | 'territory' | 'region';
export type EntityStatus =
  | 'un-member' | 'un-observer' | 'partially-recognized'
  | 'dependency' | 'special-region' | 'disputed';

export type BorderPolicy = 'de-facto' | 'un-reference' | 'custom';
export type LodLevel = 'L0' | 'L1' | 'L2';

/** Repository vocabulary mirrored from @sps/shared. */
export type Domain = 'health' | 'education' | 'telecom' | 'public_services' | 'agriculture';
/** `subnational` = below the country (states, regions); `regional` = supranational blocs. */
export type Jurisdiction = 'national' | 'subnational' | 'regional' | 'international';
export type DocType = 'law' | 'strategy' | 'regulation' | 'policy' | 'treaty' | 'standard' | 'guidance' | 'report';
export type CorpusRights = 'official-text' | 'open-licence' | 'quotation-only' | 'to-confirm';
export type WorkflowLens = 'simulation' | 'readiness' | 'hybrid';
export type SandboxMode = 'local' | 'sovereign' | 'cloud';
export type OperatorRole = 'operator' | 'admin';

export type ReadinessFactor = 'data' | 'research' | 'deployment' | 'standards' | 'opensource' | 'sandbox';
export type ReadinessDimension =
  | 'data_marketplace' | 'generated_content' | 'cross_domain' | 'contextualization'
  | 'ai_integration' | 'human_interface' | 'strategy_alignment' | 'collaboration'
  | 'human_impact' | 'ai_policies' | 'ai_inclusion' | 'granular_priorities'
  | 'digital_infrastructure';

/* ------------------------------------------------------------------ */
/* 2. Geometry                                                        */
/* ------------------------------------------------------------------ */

export interface GeoEntity {
  id: EntityId;
  kind: EntityKind;
  status: EntityStatus;
  parentId?: GeoCountryId;
  names: Localized;
  bbox: BBox;
  centroid: Point;
  labelAnchor: Point;
  area: number;
  /** SVG paths (relative commands, manifest frame). One entry per part. */
  d: readonly string[];
  children?: readonly RegionId[];
  /** Mainland bounding box used for framing (countries with far-flung parts). */
  focusBBox?: BBox;
  /** Far-flung parts reachable through chips (entity ids). */
  outlying?: readonly EntityId[];
  /** True when the entity is drawn as a marker at low zoom (micro-states). */
  marker?: boolean;
}

export interface GeometryChunkRef {
  url: string;
  sha256: Hash;
  bytes: number;
  entities: number;
}

export interface GeometryManifest {
  schemaVersion: 1;
  geoVersion: string;
  viewBox: readonly [number, number, number, number];
  projection: string;
  borderPolicy: BorderPolicy;
  chunks: {
    world: { L0: GeometryChunkRef; L1: GeometryChunkRef };
    adm1: Record<GeoCountryId, GeometryChunkRef>;
    names: Record<Locale, GeometryChunkRef>;
    adjacency: GeometryChunkRef;
    groups?: GeometryChunkRef;
  };
  sources: ReadonlyArray<{ name: string; version: string; licence: string; url: string; sha256: Hash }>;
  builtAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* 3. Map engine                                                  */
/* ------------------------------------------------------------------ */

export type EntityVisualState =
  | 'hover' | 'focus' | 'selected' | 'participating' | 'running'
  | 'succeeded' | 'failed' | 'no-data' | 'disputed' | 'dimmed' | 'loading';

export type ColorScaleKind = 'sequential' | 'diverging' | 'categorical';

export interface ColorScale {
  kind: ColorScaleKind;
  /** Id of a predefined palette (colour-blind safe by default). */
  palette: string;
  domain?: readonly [number, number];
  classing?: { method: 'quantile' | 'equal' | 'jenks' | 'fixed'; classes: number; breaks?: readonly number[] };
  reverse?: boolean;
}

export interface LayerBase {
  id: string;
  visible?: boolean;
  opacity?: number;
  zIndex?: number;
}

export interface ChoroplethLayer extends LayerBase {
  type: 'choropleth';
  /** `null`/`undefined` = no value (hatched pattern). */
  accessor: (id: EntityId) => number | null | undefined;
  scale: ColorScale;
  /** Confidence 0..1: modulates opacity and border. */
  confidence?: (id: EntityId) => number | undefined;
  legend?: { title: Localized; unit?: string; noDataLabel: Localized };
  /** Level the layer applies to. */
  level?: 'country' | 'region';
}

export interface MarkerLayer extends LayerBase {
  type: 'markers';
  items: () => ReadonlyArray<{
    id: string; entityId: EntityId; at?: Point;
    shape: 'circle' | 'square' | 'glyph'; size?: number; label?: string; badge?: string | number;
  }>;
}

export interface FlowLayer extends LayerBase {
  type: 'flows';
  items: () => ReadonlyArray<{ id: string; from: GeoCountryId; to: GeoCountryId; weight: number; label?: string }>;
  animate?: boolean;
}

export interface LabelLayer extends LayerBase {
  type: 'labels';
  minZoom?: number;
  maxLabels?: number;
}

export type Layer = ChoroplethLayer | MarkerLayer | FlowLayer | LabelLayer;

export interface ViewState {
  scale: number;
  translate: Point;
  level: 'world' | 'country' | 'region';
  focusedEntity?: EntityId;
}

export interface FlyToOptions { padding?: number; durationMs?: number; level?: 'world' | 'country' | 'region'; }

export interface SelectionChange {
  added: readonly EntityId[];
  removed: readonly EntityId[];
  selected: readonly EntityId[];
  source: 'pointer' | 'keyboard' | 'api' | 'group' | 'rectangle' | 'palette';
}

export interface EntityEvent {
  id: EntityId;
  kind: EntityKind;
  modifiers: { shift: boolean; ctrl: boolean; alt: boolean; meta: boolean };
  originalEvent?: Event;
}

export interface WorldMapEvents {
  ready: { geoVersion: string };
  entityhover: EntityEvent | null;
  entityclick: EntityEvent;
  entityfocus: EntityEvent;
  selectionchange: SelectionChange;
  viewchange: ViewState;
  levelchange: { level: ViewState['level']; entity?: EntityId };
  layerchange: { layerId: string };
  geometryloading: { id: GeoCountryId | 'world'; level: LodLevel };
  geometryloaded: { id: GeoCountryId | 'world'; level: LodLevel; ms: number };
  error: { code: WorldMapErrorCode; message: string; entity?: EntityId; cause?: unknown };
}

export type WorldMapErrorCode =
  | 'manifest-invalid' | 'hash-mismatch' | 'chunk-load-failed'
  | 'worker-unavailable' | 'unsupported-browser' | 'layer-error';

export interface WorldMapOptions {
  manifestUrl: string;
  locale?: Locale;
  theme?: 'light' | 'dark' | 'high-contrast' | 'auto';
  borderPolicy?: BorderPolicy;
  selectionMode?: 'none' | 'single' | 'multi';
  maxSelection?: number;
  /** Zoom limits. */
  minScale?: number;
  maxScale?: number;
  /** How colours are written: 'attr' (default, fastest when measured) or 'cssvar'. */
  fillMode?: 'attr' | 'cssvar';
  reducedMotion?: 'auto' | 'always' | 'never';
  prefetch?: { enabled: boolean; countries?: readonly GeoCountryId[] };
  /** Fallbacks. */
  useWorker?: boolean;
}

export interface WorldMap {
  readonly options: Readonly<WorldMapOptions>;

  setLayers(layers: readonly Layer[]): void;
  updateLayer(id: string, patch: Partial<Layer>): void;
  invalidate(layerId?: string): void; // redraw after data changes

  setSelection(ids: readonly EntityId[], source?: SelectionChange['source']): void;
  getSelection(): readonly EntityId[];
  selectGroup(groupId: string, mode?: 'replace' | 'add' | 'remove'): void;

  setEntityState(id: EntityId, state: Partial<Record<EntityVisualState, boolean>>): void;
  clearEntityStates(state?: EntityVisualState): void;

  getView(): ViewState;
  flyTo(id: EntityId, options?: FlyToOptions): Promise<void>;
  fitBounds(bbox: BBox, options?: FlyToOptions): Promise<void>;
  zoomBy(factor: number, around?: Point): void;
  resetView(): void;

  openCountry(id: GeoCountryId): Promise<void>;     // loads L2, shows regions, frames focusBBox when present
  closeCountry(): void;

  setLocale(locale: Locale): void;
  setTheme(theme: NonNullable<WorldMapOptions['theme']>): void;
  setBorderPolicy(policy: BorderPolicy): Promise<void>;

  getEntity(id: EntityId): GeoEntity | undefined;
  search(query: string, limit?: number): ReadonlyArray<{ id: EntityId; name: string; kind: EntityKind }>;

  on<K extends keyof WorldMapEvents>(type: K, handler: (e: WorldMapEvents[K]) => void): () => void;

  exportSVG(): string;
  exportPNG(options?: { scale?: number; includeLegend?: boolean }): Promise<Blob>;
  exportState(): SerializedMapState;
  importState(state: SerializedMapState): void;

  destroy(): void;
}

export interface SerializedMapState {
  schemaVersion: 1;
  view: ViewState;
  selection: readonly EntityId[];
  activeLayerId?: string;
  geoVersion: string;
}

export function createWorldMap(container: HTMLElement, options: WorldMapOptions): WorldMap;

/* ------------------------------------------------------------------ */
/* 4. World read models                                                */
/* ------------------------------------------------------------------ */

/** Resolved by the display rules of docs/05. */
export type WorldCellState = 'not-assessed' | 'no-grounded-data' | 'low-confidence' | 'ok';

export interface WorldSettings {
  schemaVersion: 1;
  thresholds: {
    minCountryChunks: number; minCoverage: number; minConfidence: number;
    rankMinCoverage: number; rankMinConfidence: number; staleAfterDays: number;
  };
  queue: {
    enabled: boolean;
    /** null = use the environment variable, then the mode default. */
    concurrencyPerOperator: number | null;
    concurrencyGlobal: number | null;
    queueMax: number; maxCountriesPerTest: number; jobTimeoutMs: number; jobRetries: number; autoResume: boolean;
  };
  watch: { enabled: boolean };
}

export type SettingSource = 'runtime' | 'env' | 'default';
export interface EffectiveSetting<T> { value: T; source: SettingSource; }

export interface WorldSummaryEntry {
  code: RegistryCode;
  registryStatus: 'active' | 'planned' | 'unregistered';
  sectors: readonly Domain[];
  state: WorldCellState;
  composite?: number | null;           // 0..5, the engine's value, unchanged
  band?: string | null;                // MATURITY_LEVELS label
  coverage?: number | null;            // groundedDimensions / 13
  confidence?: number | null;          // weighted mean of DimensionScore.confidence
  stale: boolean;
  runs: number;
  lastRunAt?: ISODateTime | null;
  corpus: { chunks: number; manifestPresent?: boolean; criticalPresent?: number; criticalTotal?: number };
  dims?: Partial<Record<ReadinessDimension, number | null>>;
}

/** mine = the current operator's complete runs; shared = every operator's, summary fields only. */
export type ReportScope = 'mine' | 'shared';

export interface WorldSummary {
  schemaVersion: 1;
  frameworkVersion: string;
  sector: Domain | 'all';
  scope: ReportScope;
  generatedAt: ISODateTime;
  countries: readonly WorldSummaryEntry[];
}

export interface CountrySheet {
  code: RegistryCode;
  record: {
    name: string; nameFr: string; jurisdiction: Jurisdiction; region: string; authority: string;
    languages: readonly string[]; sectors: readonly Domain[]; status: 'active' | 'planned';
  };
  perSector: ReadonlyArray<{ sector: Domain; enabled: boolean; summary: WorldSummaryEntry | null; runs: number }>;
  corpus: { chunks: number; documents?: ReadonlyArray<{ id: string; docType: DocType; status: string; rights: CorpusRights; priority?: string }> };
  watch: { lastWatchAt: ISODateTime | null; pendingProposals: number };
  groups: readonly string[];
  regions: readonly RegionId[];
}

/** Per-run visibility in the shared scope (default 'shared'). */
export type RunSharing = 'shared' | 'excluded';
export type RunKind = 'readiness' | 'scenario';

export interface RunSharingService {
  /** Owner only. Writes the audit action world.run.sharing.changed. */
  setSharing(kind: RunKind, runId: string, sharing: RunSharing, operator: string): Promise<void>;
}

/** Registry record as seeded (mirror of CountryRecord plus the optional World fields). */
export interface CountryRegistrySeed {
  code: RegistryCode; name: string; nameFr: string;
  jurisdiction: 'national' | 'regional' | 'international';
  region: string; authority: string; currency: string; languages: readonly string[];
  /** IANA zone of the seat of government. */
  timezone: string;
  timezones?: readonly string[];
  authorities?: Partial<Record<Domain, string>>;
  adminLevel?: { en: string; fr: string };
  sectors: readonly Domain[]; status: 'active' | 'planned'; notes?: string;
}

export interface WorldGroup {
  id: string;
  name: Localized;
  members: readonly RegistryCode[];
  source: string;
  validFrom: string;
  validTo?: string;
}

/* ------------------------------------------------------------------ */
/* 5. Battle tests                                                     */
/* ------------------------------------------------------------------ */

export type BattleTestType = 'readiness' | 'simulation' | 'hybrid' | 'exercise' | 'cross-border';
export type BattleTestState =
  | 'draft' | 'validated' | 'queued' | 'running' | 'paused' | 'completed' | 'partial' | 'failed' | 'canceled';
export type JobState =
  | 'queued' | 'leased' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'canceled' | 'interrupted';

/** Subset of the existing ReadinessRunInput (country, domain, globalCountry, batchId are set by the orchestrator). */
export interface ReadinessJobSettings {
  dimensions?: readonly ReadinessDimension[];
  perDimensionK?: number;
  useWeb?: boolean;
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
  models?: { webSearch?: string; evaluate?: string; synthesis?: string };
  concurrency?: 'parallel' | 'sequential' | 'orchestrated';
  maxDecisions?: number;
  language?: 'fr' | 'en';
  weights?: Partial<Record<ReadinessDimension, number>>;
  /** Include `subnational` documents in a country-level job (always included when the participant carries a regionId). */
  includeSubnational?: boolean;
  /** Reference corpora to use for this country (e.g. ['eu', 'standards']); default unchanged. */
  referenceNamespaces?: readonly string[];
}
export interface SimulationJobSettings { scenarioId?: string; agents?: readonly string[]; chunkDelayMs?: number; model?: string; }
export interface ExerciseJobSettings { exerciseId?: string; clockSpeed?: number; }

export interface JobSettings {
  readiness?: ReadinessJobSettings;
  simulation?: SimulationJobSettings;
  exercise?: ExerciseJobSettings;
  timeoutMs?: number;
  priority?: number;
}

export interface BattleTestParticipant { code: RegistryCode; regionId?: RegionId; }

export interface BattleTestConfig {
  schemaVersion: 1;
  type: BattleTestType;
  title?: string;
  sectors: readonly Domain[];
  participants: readonly BattleTestParticipant[];
  /** Sparse overrides; cascade: type defaults < global < groups < countries < regions. */
  settings?: {
    global?: JobSettings;
    groups?: Record<string, JobSettings>;
    countries?: Record<RegistryCode, JobSettings>;
    regions?: Record<RegionId, JobSettings>;
  };
  tags?: readonly string[];
}

export interface PreflightCheck {
  id: string;
  scope: 'test' | RegistryCode;
  level: 'ok' | 'warning' | 'error';
  message: string;
}

export interface PreflightReport {
  ok: boolean;
  checks: readonly PreflightCheck[];
  jobs: number;
  estimate?: { wallClockSec: readonly [min: number, max: number] | null; tokens: readonly [number, number] | null; costUsd: readonly [number, number] | null };
  caps: {
    concurrencyPerOperator: EffectiveSetting<number>;
    concurrencyGlobal: EffectiveSetting<number>;
    queueRoom: number;
  };
}

export interface JobManifestEntry {
  code: RegistryCode;
  sector: Domain;
  settingsHash: Hash;
  runId?: string;
  mode: SandboxMode;
  modelIds: readonly string[];
  corpusFingerprint?: { chunks: number; latestIngestAt: ISODateTime | null; manifestGenerated: string | null };
  startedAt?: ISODateTime;
}

export interface BattleTestJob {
  id: string;
  code: RegistryCode;
  sector: Domain;
  state: JobState;
  attempts: number;
  runId?: string;
  failure?: string;
  startedAt?: ISODateTime;
  finishedAt?: ISODateTime;
}

export interface BattleTest {
  schemaVersion: 1;
  id: string;
  operator: string;
  type: BattleTestType;
  state: BattleTestState;
  config?: BattleTestConfig;
  manifest: { frameworkVersion: string; codeVersion: string; geoVersion: string; perJob: readonly JobManifestEntry[] };
  jobs: readonly BattleTestJob[];
  createdAt: ISODateTime;
  finishedAt?: ISODateTime;
}

export type WorldEvent =
  | { type: 'test.queued' | 'test.started' | 'test.paused' | 'test.resumed' | 'test.finished' }
  | { type: 'job.queued' | 'job.leased' | 'job.succeeded' | 'job.interrupted'; jobId: string }
  | { type: 'job.failed'; jobId: string; message: string; retryable: boolean }
  | { type: 'job.progress'; jobId: string; engineEvent: { type: string; [k: string]: unknown } }
  | { type: 'queue.position'; jobId: string; ahead: number }
  | { type: 'settings.changed'; key: string };

export interface WorldEventEnvelope<T extends WorldEvent = WorldEvent> {
  /** Monotonic per test; used for Last-Event-ID resume. */
  id: number;
  ts: ISODateTime;
  testId: string;
  data: T;
}

export interface MatrixRow {
  code: RegistryCode;
  sector: Domain;
  metrics: Record<string, number | string | null>;
}

export interface BattleTestResults {
  testId: string;
  matrix: readonly MatrixRow[];
  divergences: ReadonlyArray<{ topic: string; byCountry: Record<RegistryCode, { summary: string; chunkIds: readonly string[] }> }>;
  heterogeneityWarnings: readonly ('corpus-size' | 'mode-or-model' | 'framework-version' | 'stale-corpus' | 'language')[];
  disclaimer: 'simulation-not-legal-advice';
}

/* ------------------------------------------------------------------ */
/* 6. Legal watch                                                      */
/* ------------------------------------------------------------------ */

export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'ingested';

export interface WatchProposal {
  schemaVersion: 1;
  id: string;
  country: RegistryCode;
  sourceUrl: string;
  sourceTier?: 1 | 2;
  title: string;
  authority?: string;
  docType: DocType;
  jurisdiction: Jurisdiction;
  /** ISO 3166-2, required when jurisdiction is 'subnational'. */
  subdivision?: RegionId;
  publishedAt?: string;
  rights: CorpusRights;
  rightsReason?: string;
  excerpt: string;              // <= 400 chars, verified verbatim by code
  excerptVerified: true;
  contentHash: Hash;
  status: ProposalStatus;
  decision?: { by: string; at: ISODateTime; reason?: string };
  discovery: { query: string; at: ISODateTime; via: 'web-search' | 'update-check' | 'offline-bundle' };
  ingestRef?: string;
}

export type WatchScope =
  | { kind: 'country'; code: RegistryCode }
  | { kind: 'sector'; code: RegistryCode; sector: Domain }
  | { kind: 'update-check'; code: RegistryCode }
  | { kind: 'group'; groupId: string };

export interface FetchedDocument {
  url: string; finalUrl: string; mime: string; bytes: number; text: string;
  contentHash: Hash; retrievedAt: ISODateTime;
}

export interface SafeFetchOptions { maxBytes?: number; timeoutMs?: number; accept?: readonly string[]; }

/* ------------------------------------------------------------------ */
/* 7. Server-side services (contract; implemented in @sps/world)       */
/* ------------------------------------------------------------------ */

export interface WorldSummaryService {
  /** `shared` must never return report text, settings, chain-of-thought or operator identity. */
  summary(sector: Domain | 'all', scope: ReportScope, operator: string): Promise<WorldSummary>;
  sheet(code: RegistryCode, scope: ReportScope, operator: string): Promise<CountrySheet>;
}

export interface WorldSettingsService {
  get(): Promise<WorldSettings>;
  effective(): Promise<{ concurrencyPerOperator: EffectiveSetting<number>; concurrencyGlobal: EffectiveSetting<number> }>;
  update(patch: Partial<WorldSettings>, actor: { email: string; role: OperatorRole }): Promise<WorldSettings>;
}

/** Minimal mirror of the existing WorkGate (apps/api/src/concurrency.ts). */
export interface GateLease { release(): void; }
export interface WorkGateLike { tryEnter(operator: string): GateLease | null; setLimits?(limits: { perOperator: number; global: number }): void; }

export interface BattleTestOrchestrator {
  validate(config: BattleTestConfig, operator: string): Promise<PreflightReport>;
  dryRun(config: BattleTestConfig, operator: string): Promise<{ plan: readonly string[]; report: PreflightReport }>;
  start(config: BattleTestConfig, operator: string): Promise<{ id: string }>;       // throws queue_full
  get(id: string, operator: string): Promise<BattleTest>;
  events(id: string, operator: string, lastEventId?: number): AsyncIterable<WorldEventEnvelope>;
  pause(id: string, operator: string): Promise<void>;
  resume(id: string, operator: string): Promise<void>;
  cancel(id: string, operator: string): Promise<void>;
  retryJob(id: string, jobId: string, operator: string): Promise<void>;
  results(id: string, operator: string): Promise<BattleTestResults>;
  compare(a: string, b: string, operator: string): Promise<unknown>;
  replay(id: string, operator: string): Promise<{ id: string; drift: readonly string[] }>;
}

export interface LegalWatchService {
  estimate(scope: WatchScope): Promise<{ queries: number; domains: readonly string[]; modelCalls: number; requiresOnline: boolean }>;
  start(scope: WatchScope, operator: string): Promise<{ jobId: string }>;
  cancel(jobId: string, operator: string): Promise<void>;
  proposals(filter?: { country?: RegistryCode; status?: ProposalStatus }): Promise<readonly WatchProposal[]>;
  decide(id: string, decision: { decision: 'accept' | 'reject' | 'edit'; edit?: Partial<WatchProposal>; reason?: string }, actor: { email: string; role: OperatorRole }): Promise<WatchProposal>;
  importBundle(bundle: Blob, operator: string): Promise<{ jobId: string; proposals: number }>;
}

export interface SafeFetcher {
  fetch(url: string, options?: SafeFetchOptions): Promise<FetchedDocument>;
}

export interface WorldAudit {
  /** Wraps AuditService.logAction; lens is the job's lens, or 'hybrid' for World-level actions. */
  log(entry: { action: string; target?: string; runId?: string; lens: WorkflowLens; userId: string }): Promise<{ hash: string }>;
}
