'use client'

/**
 * Bilingual demo UI (EN / FR). English is the default: the judges, the README
 * and the submission are in English, while the primary deployment context
 * (Cameroon) operates in French.
 *
 * Messages are a flat key → string map so a missing translation is a type
 * error, not a runtime fallback.
 */

import * as React from 'react'

export type Locale = 'en' | 'fr'

export const LOCALES: readonly Locale[] = ['en', 'fr'] as const

export const LOCALE_STORAGE_KEY = 'sps.locale'

const en = {
  'app.tagline': 'One policy-grounded engine · two lenses · runs on Meta models',
  'app.theme': 'Theme',
  'app.toggleTheme': 'Toggle light / dark',
  'app.language': 'Language',
  'app.country': 'Country',
  'app.domain': 'Domain',

  'provider.title': 'Inference provider',
  'provider.mode.cloud': 'Meta Model API',
  'provider.mode.sovereign': 'Open weights (Muse Glimmer)',
  'provider.mode.local': 'Local (Ollama)',
  'provider.residency.on-premise': 'On-premise · nothing leaves the institution',
  'provider.residency.cloud': 'Cloud API',
  'provider.ready': 'Ready',
  'provider.notReady': 'Not configured',
  'provider.openWeights': 'Open weights',
  'provider.budget': 'Run budget',
  'provider.switchHint': 'Set SANDBOX_MODE=cloud | sovereign | local and restart the API.',
  'app.madeBy': 'Made with',

  'citation.verified': 'Every quoted provision was found in the corpus',
  'citation.verifiedAfterRetry': 'Answer rejected once, then verified ({attempts} attempts)',
  'citation.rejected': '{count} quote(s) could not be found in the corpus — reported as a gap',

  'country.cm': 'Cameroon (CM)',
  'country.ae': 'United Arab Emirates (AE)',
  'domain.health': 'Health',
  'domain.education': 'Education',
  'domain.telecom': 'Telecom',
  'domain.public_services': 'Public services',
  'domain.agriculture': 'Agriculture',

  'lens.aria': 'Workflow lens',
  'lens.simulation.label': 'Error-scenario simulation',
  'lens.simulation.description':
    'Run a progressive, chunked error scenario across mandated agents; emit an audit trail and gap findings.',
  'lens.readiness.label': 'AI readiness assessment',
  'lens.readiness.description':
    'Assess a country corpus against the 13 AI-readiness dimensions (6 factors) and produce a gap report.',
  'lens.hybrid.label': 'Simulation + readiness',
  'lens.hybrid.description': 'Run a simulation that emits the readiness / gap report as a by-product.',
  'workflow.stages': 'WORKFLOW STAGES',
  'workflow.on': 'on',
  'workflow.off': 'off',

  'readiness.title': 'AI READINESS — SCORING 0–5 (13 DIMENSIONS)',
  'readiness.run': 'Assess {country} · {domain}',
  'readiness.running': 'Assessing…',
  'readiness.composite': 'Weighted composite',
  'readiness.average': 'Average',
  'readiness.empty':
    'Run an assessment to score the 13 dimensions (0–5) and project a policy change through the causal graph.',
  'readiness.whatIf': 'WHAT-IF CAUSAL',
  'readiness.simulate': 'Simulate',
  'readiness.dimension': 'Dimension',
  'readiness.delta': 'Delta',

  'scenario.title': 'MULTI-AGENT COORDINATION — HEALTH DATA BREACH',
  'scenario.facilitated': 'Facilitator mode',
  'scenario.auto': 'Run (auto)',
  'scenario.running': 'Simulating…',
  'scenario.dossier': 'Dossier (MD)',
  'scenario.intro':
    'Facts are released in batches (information asymmetry), each mandated institution assesses them independently, then the coordinator reconciles the assessments and flags conflicts between mandates. Facilitator mode releases one batch at a time.',
  'scenario.next': 'Release next batch',
  'scenario.progress': 'Batch {released}/{total}',
  'scenario.upNext': 'next: “{title}”',
  'scenario.seenBy': 'seen by: {agents}',
  'scenario.batch': 'BATCH {n}',
  'scenario.agreements': 'AGREEMENTS',
  'scenario.conflicts': 'MANDATE CONFLICTS',
  'scenario.openQuestions': 'OPEN QUESTIONS',
  'scenario.assessments': '{count} ASSESSMENT(S)',
  'scenario.timeline': 'INCIDENT TIMELINE',

  'timeline.batch': 'BATCH {n}',
  'timeline.released': 'released',
  'timeline.pending': 'not yet released',
  'timeline.visibleTo': 'Visible to',

  'severity.low': 'low',
  'severity.medium': 'medium',
  'severity.high': 'high',
  'severity.critical': 'critical',

  'audit.title': 'CHAIN-OF-THOUGHT & AUDIT',
  'audit.integrityOk': 'AUDIT CHAIN INTEGRITY OK',
  'audit.chainBroken': 'CHAIN BROKEN @ {at}',
  'audit.loading': 'Loading traces…',
  'audit.empty': 'No trace persisted for this run.',

  'assistant.title': 'POLICY ASSISTANT',
  'assistant.open': 'Open the policy assistant',
  'assistant.minimize': 'Minimize',
  'assistant.placeholder': 'Ask a question (text + image)…',
  'assistant.placeholderCompact': 'Ask an institutional agent…',
  'assistant.agent': 'Agent',
  'assistant.attach': 'Attach an image',
  'assistant.send': 'Send',
  'assistant.removeImage': 'Remove the image',
  'assistant.searching': 'Looking up the applicable provision…',

  'gazette.title': 'SCANNED GAZETTE',
  'gazette.subtitle': 'N3 · layout + SAM 3.1',
  'gazette.hint':
    'A scanned page has no text layer. The pipeline finds the columns, transcribes each zone with the vision model and locates stamps, signatures and tables with SAM 3.1 — then shows you where every line came from.',
  'gazette.choose': 'Choose a page',
  'gazette.sample': 'Use the sample page',
  'gazette.analyze': 'Segment & transcribe',
  'gazette.analyzing': 'Segmenting and transcribing the page…',
  'gazette.addToCorpus': 'Add to corpus',
  'gazette.ingesting': 'Ingesting…',
  'gazette.ingested': 'Page {page}: {zones} zones → {chunks} chunks inserted in the corpus.',
  'gazette.page': 'Page',
  'gazette.columns': 'Columns',
  'gazette.zones': 'Zones',
  'gazette.artifacts': 'Artefacts',
  'gazette.cost': 'Cost',
  'gazette.duration': 'Duration',
  'gazette.artifact.table': 'table',
  'gazette.artifact.stamp': 'stamp',
  'gazette.artifact.signature': 'signature',
  'gazette.skipped': 'artefact',
  'gazette.noText': 'no text',
  'gazette.column': 'col.',
  'gazette.characters': 'chars',
  'gazette.warnings': 'Warnings',
  'gazette.noTextOnPage': 'No readable text on this page — nothing will be added to the corpus.',
  'gazette.corpusHint':
    'Text zones and tables are added as one page document; stamps and signatures stay in the overlay and are never retrieved as law.',
  'gazette.empty': 'Load the sample page or a PNG/JPEG scan to see the segmentation overlay.',
}

const fr: Record<keyof typeof en, string> = {
  'app.tagline': 'Un moteur policy-grounded · deux lenses · tourne sur les modèles Meta',
  'app.theme': 'Thème',
  'app.toggleTheme': 'Basculer clair / sombre',
  'app.language': 'Langue',
  'app.country': 'Pays',
  'app.domain': 'Domaine',

  'provider.title': 'Fournisseur d’inférence',
  'provider.mode.cloud': 'Meta Model API',
  'provider.mode.sovereign': 'Poids ouverts (Muse Glimmer)',
  'provider.mode.local': 'Local (Ollama)',
  'provider.residency.on-premise': 'Sur site · aucune donnée ne quitte l’institution',
  'provider.residency.cloud': 'API cloud',
  'provider.ready': 'Prêt',
  'provider.notReady': 'Non configuré',
  'provider.openWeights': 'Poids ouverts',
  'provider.budget': 'Budget par exécution',
  'provider.switchHint': 'Régler SANDBOX_MODE=cloud | sovereign | local puis redémarrer l’API.',
  'app.madeBy': 'Fait avec',

  'citation.verified': 'Chaque disposition citée a été retrouvée dans le corpus',
  'citation.verifiedAfterRetry': 'Réponse rejetée une fois, puis vérifiée ({attempts} tentatives)',
  'citation.rejected': '{count} citation(s) introuvable(s) dans le corpus — signalée(s) comme lacune',

  'country.cm': 'Cameroun (CM)',
  'country.ae': 'Émirats arabes unis (AE)',
  'domain.health': 'Santé',
  'domain.education': 'Éducation',
  'domain.telecom': 'Télécoms',
  'domain.public_services': 'Services publics',
  'domain.agriculture': 'Agriculture',

  'lens.aria': 'Lentille de workflow',
  'lens.simulation.label': 'Simulation de scénario d’erreur',
  'lens.simulation.description':
    'Dérouler un scénario d’erreur progressif par blocs entre agents mandatés ; produire une piste d’audit et des lacunes.',
  'lens.readiness.label': 'Évaluation de readiness IA',
  'lens.readiness.description':
    'Évaluer le corpus d’un pays au regard des 13 dimensions de readiness (6 facteurs) et produire un rapport d’écart.',
  'lens.hybrid.label': 'Simulation + readiness',
  'lens.hybrid.description':
    'Dérouler une simulation qui produit aussi le rapport de readiness / d’écart.',
  'workflow.stages': 'ÉTAPES DU WORKFLOW',
  'workflow.on': 'on',
  'workflow.off': 'off',

  'readiness.title': 'AI READINESS — SCORING 0–5 (13 DIMENSIONS)',
  'readiness.run': 'Évaluer {country} · {domain}',
  'readiness.running': 'Analyse…',
  'readiness.composite': 'Composite pondéré',
  'readiness.average': 'Moyenne',
  'readiness.empty':
    'Lance une évaluation pour scorer les 13 dimensions (0–5) et projeter un changement de politique via le graphe causal.',
  'readiness.whatIf': 'WHAT-IF CAUSAL',
  'readiness.simulate': 'Simuler',
  'readiness.dimension': 'Dimension',
  'readiness.delta': 'Écart',

  'scenario.title': 'COORDINATION MULTI-AGENTS — FUITE DE DONNÉES DE SANTÉ',
  'scenario.facilitated': 'Mode facilitateur',
  'scenario.auto': 'Lancer (auto)',
  'scenario.running': 'Simulation…',
  'scenario.dossier': 'Dossier (MD)',
  'scenario.intro':
    'Les faits sont libérés par blocs (information asymétrique), chaque institution mandatée évalue indépendamment, puis le coordinateur réconcilie les évaluations et signale les conflits de mandats. Le mode facilitateur libère un bloc à la fois.',
  'scenario.next': 'Libérer le bloc suivant',
  'scenario.progress': 'Bloc {released}/{total}',
  'scenario.upNext': 'prochain : « {title} »',
  'scenario.seenBy': 'vu par : {agents}',
  'scenario.batch': 'BLOC {n}',
  'scenario.agreements': 'ACCORDS',
  'scenario.conflicts': 'CONFLITS DE MANDATS',
  'scenario.openQuestions': 'QUESTIONS OUVERTES',
  'scenario.assessments': '{count} ÉVALUATION(S)',
  'scenario.timeline': 'CHRONOLOGIE DE L’INCIDENT',

  'timeline.batch': 'BLOC {n}',
  'timeline.released': 'libéré',
  'timeline.pending': 'pas encore libéré',
  'timeline.visibleTo': 'Visible par',

  'severity.low': 'faible',
  'severity.medium': 'moyenne',
  'severity.high': 'élevée',
  'severity.critical': 'critique',

  'audit.title': 'CHAÎNE DE RAISONNEMENT & AUDIT',
  'audit.integrityOk': 'INTÉGRITÉ DE LA CHAÎNE D’AUDIT OK',
  'audit.chainBroken': 'CHAÎNE ROMPUE @ {at}',
  'audit.loading': 'Chargement des traces…',
  'audit.empty': 'Aucune trace persistée pour ce run.',

  'assistant.title': 'ASSISTANT POLITIQUE',
  'assistant.open': 'Ouvrir l’assistant politique',
  'assistant.minimize': 'Réduire',
  'assistant.placeholder': 'Posez une question (texte + image)…',
  'assistant.placeholderCompact': 'Interroger un agent institutionnel…',
  'assistant.agent': 'Agent',
  'assistant.attach': 'Joindre une image',
  'assistant.send': 'Envoyer',
  'assistant.removeImage': 'Retirer l’image',
  'assistant.searching': 'Recherche de la disposition applicable…',

  'gazette.title': 'JOURNAL OFFICIEL NUMÉRISÉ',
  'gazette.subtitle': 'N3 · mise en page + SAM 3.1',
  'gazette.hint':
    'Une page numérisée n’a pas de couche texte. Le pipeline détecte les colonnes, transcrit chaque zone avec le modèle vision et localise tampons, signatures et tableaux avec SAM 3.1 — puis vous montre d’où vient chaque ligne.',
  'gazette.choose': 'Choisir une page',
  'gazette.sample': 'Utiliser la page d’exemple',
  'gazette.analyze': 'Segmenter et transcrire',
  'gazette.analyzing': 'Segmentation et transcription de la page…',
  'gazette.addToCorpus': 'Ajouter au corpus',
  'gazette.ingesting': 'Ingestion…',
  'gazette.ingested': 'Page {page} : {zones} zones → {chunks} chunks insérés dans le corpus.',
  'gazette.page': 'Page',
  'gazette.columns': 'Colonnes',
  'gazette.zones': 'Zones',
  'gazette.artifacts': 'Artefacts',
  'gazette.cost': 'Coût',
  'gazette.duration': 'Durée',
  'gazette.artifact.table': 'tableau',
  'gazette.artifact.stamp': 'tampon',
  'gazette.artifact.signature': 'signature',
  'gazette.skipped': 'artefact',
  'gazette.noText': 'sans texte',
  'gazette.column': 'col.',
  'gazette.characters': 'car.',
  'gazette.warnings': 'Avertissements',
  'gazette.noTextOnPage': 'Aucun texte lisible sur cette page — rien ne sera ajouté au corpus.',
  'gazette.corpusHint':
    'Les zones de texte et les tableaux forment un document de page ; les tampons et signatures restent dans l’overlay et ne sont jamais retrouvés comme du droit.',
  'gazette.empty': 'Chargez la page d’exemple ou un scan PNG/JPEG pour voir l’overlay de segmentation.',
}

const DICTIONARIES: Record<Locale, Record<keyof typeof en, string>> = { en, fr }

export type MessageKey = keyof typeof en

/** Locale from the build-time default (`NEXT_PUBLIC_DEFAULT_LOCALE`, English). */
export function defaultLocale(): Locale {
  const value = (process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? 'en').toLowerCase()
  return (LOCALES as readonly string[]).includes(value) ? (value as Locale) : 'en'
}

export function translate(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  const template = DICTIONARIES[locale][key] ?? DICTIONARIES.en[key] ?? key
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`))
}

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
}

const I18nContext = React.createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<Locale>(defaultLocale)

  // Restore the visitor's choice (the first render stays server-consistent).
  React.useEffect(() => {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (stored && (LOCALES as readonly string[]).includes(stored)) setLocaleState(stored as Locale)
  }, [])

  React.useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = React.useCallback((next: Locale) => {
    setLocaleState(next)
    localStorage.setItem(LOCALE_STORAGE_KEY, next)
  }, [])

  const value = React.useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t: (key, vars) => translate(locale, key, vars) }),
    [locale, setLocale],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const context = React.useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used inside <I18nProvider>.')
  return context
}
