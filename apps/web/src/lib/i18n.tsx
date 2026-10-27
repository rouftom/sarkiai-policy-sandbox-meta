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

  'approval.title': 'HUMAN APPROVAL',
  'approval.loading': 'Verifying the approval link…',
  'approval.invalid': 'This approval link is invalid or has expired.',
  'approval.run': 'Run',
  'approval.expires': 'Expires',
  'approval.pending': 'Awaiting a decision',
  'approval.approved': 'Approved',
  'approval.rejected': 'Rejected',
  'approval.decidedAt': 'Decided',
  'approval.summary': 'WHAT IS BEING APPROVED',
  'approval.reports': 'Joint reports',
  'approval.conflicts': 'conflicts',
  'approval.citations': 'citations',
  'approval.note': 'Note (optional)',
  'approval.notePlaceholder': 'Why this decision?',
  'approval.approve': 'Approve',
  'approval.reject': 'Reject',
  'approval.submitting': 'Recording…',
  'approval.already': 'This link was already used. The recorded decision is shown above.',
  'approval.error': 'The decision could not be recorded.',
  'approval.dryRun': 'WhatsApp is not configured — the link is shown here for the demo.',

  'exercise.title': 'TABLE-TOP CRISIS EXERCISE',
  'exercise.subtitle': 'N8 · deterministic scoring',
  'exercise.hint':
    'Injects are released on a clock. The team logs what it actually did, and the score is computed from that log — addressed, late or missed — before the model writes the after-action narrative. A fluent report cannot hide a missed inject.',
  'exercise.load': 'Load the drill',
  'exercise.reload': 'Reload',
  'exercise.clock': 'Exercise clock',
  'exercise.minute': 'T+{minute} min',
  'exercise.duration': 'Duration {minutes} min',
  'exercise.injects': 'RELEASED INJECTS',
  'exercise.noInjects': 'No inject released yet — move the clock forward.',
  'exercise.expected': 'Expected',
  'exercise.window': '{minutes} min window',
  'exercise.visibleTo': 'visible to {agents}',
  'exercise.logTitle': 'LOG AN ACTION',
  'exercise.actor': 'Institution',
  'exercise.kind': 'Type',
  'exercise.kind.action': 'action',
  'exercise.kind.decision': 'decision',
  'exercise.kind.escalation': 'escalation',
  'exercise.kind.note': 'note',
  'exercise.inject': 'Answers inject',
  'exercise.noInject': 'General entry',
  'exercise.text': 'What was done',
  'exercise.textPlaceholder': 'Opened an incident, preserved the logs and paged the cyber agency.',
  'exercise.add': 'Log action',
  'exercise.remove': 'Remove',
  'exercise.actions': 'ACTION LOG',
  'exercise.noActions': 'Nothing logged yet.',
  'exercise.evaluate': 'Score at T+{minute}',
  'exercise.evaluating': 'Scoring…',
  'exercise.afterAction': 'After-action report',
  'exercise.generating': 'Writing the report…',
  'exercise.coverage': 'Coverage',
  'exercise.released': 'Released',
  'exercise.addressed': 'Answered',
  'exercise.missed': 'Missed / late',
  'exercise.average': 'Average response',
  'exercise.firstAction': 'First action',
  'exercise.minutes': '{value} min',
  'exercise.late': 'late',
  'exercise.noAction': 'no action',
  'exercise.noGaps': 'Every released inject was answered inside its window.',
  'exercise.narrative': 'AFTER-ACTION NARRATIVE',
  'exercise.lessons': 'Lessons',
  'exercise.recommendations': 'Recommendations',
  'exercise.unresolved': 'Unresolved',
  'exercise.empty': 'Load the drill to start the clock, or log actions against an inject.',
  'exercise.error': 'The exercise could not be scored.',

  'comm.title': 'PUBLIC COMMUNICATION — FULFULDE / HAUSA',
  'comm.subtitle': 'N9 · native review required',
  'comm.hint':
    'The engine drafts a public message in Fulfulde or Hausa from verified facts only. Every draft is marked pending native review: a native speaker approves the language before anything is published. Political content and medical advice are refused outright.',
  'comm.language': 'Language',
  'comm.audience': 'Audience',
  'comm.audiencePlaceholder': 'Residents of the Adamawa region',
  'comm.jurisdiction': 'Jurisdiction',
  'comm.facts': 'Verified facts',
  'comm.factsPlaceholder': 'Only the facts the institution has confirmed. The model may not add anything else.',
  'comm.channels': 'Channels',
  'comm.channel.radio': 'radio',
  'comm.channel.sms': 'SMS',
  'comm.channel.social': 'social',
  'comm.channel.press': 'press',
  'comm.draft': 'Draft the message',
  'comm.drafting': 'Drafting…',
  'comm.reviewPending': 'PENDING NATIVE REVIEW',
  'comm.reviewHint': 'A native speaker must approve every word before publication.',
  'comm.message': 'Radio-ready message',
  'comm.smsLabel': 'SMS',
  'comm.keyTerms': 'Key terms',
  'comm.term': 'Term',
  'comm.translation': 'Translation',
  'comm.caveats': 'Reviewer caveats',
  'comm.warnings': 'Warnings',
  'comm.blocked': 'Draft refused by the public-communication policy:',
  'comm.error': 'The draft could not be generated.',
  'comm.empty': 'Choose the language, give verified facts, then draft the message.',
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

  'approval.title': 'APPROBATION HUMAINE',
  'approval.loading': 'Vérification du lien d’approbation…',
  'approval.invalid': 'Ce lien d’approbation est invalide ou a expiré.',
  'approval.run': 'Exécution',
  'approval.expires': 'Expire',
  'approval.pending': 'En attente d’une décision',
  'approval.approved': 'Approuvé',
  'approval.rejected': 'Rejeté',
  'approval.decidedAt': 'Décidé',
  'approval.summary': 'CE QUI EST SOUMIS À APPROBATION',
  'approval.reports': 'Rapports conjoints',
  'approval.conflicts': 'conflits',
  'approval.citations': 'citations',
  'approval.note': 'Note (facultative)',
  'approval.notePlaceholder': 'Pourquoi cette décision ?',
  'approval.approve': 'Approuver',
  'approval.reject': 'Rejeter',
  'approval.submitting': 'Enregistrement…',
  'approval.already': 'Ce lien a déjà été utilisé. La décision enregistrée est affichée ci-dessus.',
  'approval.error': 'La décision n’a pas pu être enregistrée.',
  'approval.dryRun': 'WhatsApp n’est pas configuré — le lien est affiché ici pour la démo.',
  'exercise.title': 'EXERCICE DE CRISE SUR TABLE',
  'exercise.subtitle': 'N8 · notation déterministe',
  'exercise.hint':
    'Les injects sont libérés selon une horloge. L’équipe consigne ce qu’elle a réellement fait, et le score est calculé à partir de ce journal — traité, en retard ou manqué — avant que le modèle ne rédige la narration post-exercice. Un rapport bien tourné ne peut pas masquer un inject manqué.',
  'exercise.load': 'Charger l’exercice',
  'exercise.reload': 'Recharger',
  'exercise.clock': 'Horloge de l’exercice',
  'exercise.minute': 'T+{minute} min',
  'exercise.duration': 'Durée {minutes} min',
  'exercise.injects': 'INJECTS LIBÉRÉS',
  'exercise.noInjects': 'Aucun inject libéré — avancez l’horloge.',
  'exercise.expected': 'Attendu',
  'exercise.window': 'fenêtre de {minutes} min',
  'exercise.visibleTo': 'visible par {agents}',
  'exercise.logTitle': 'CONSIGNER UNE ACTION',
  'exercise.actor': 'Institution',
  'exercise.kind': 'Type',
  'exercise.kind.action': 'action',
  'exercise.kind.decision': 'décision',
  'exercise.kind.escalation': 'escalade',
  'exercise.kind.note': 'note',
  'exercise.inject': 'Répond à l’inject',
  'exercise.noInject': 'Entrée générale',
  'exercise.text': 'Ce qui a été fait',
  'exercise.textPlaceholder': 'Incident ouvert, journaux préservés, agence cyber alertée.',
  'exercise.add': 'Consigner',
  'exercise.remove': 'Retirer',
  'exercise.actions': 'JOURNAL DES ACTIONS',
  'exercise.noActions': 'Rien n’est encore consigné.',
  'exercise.evaluate': 'Noter à T+{minute}',
  'exercise.evaluating': 'Notation…',
  'exercise.afterAction': 'Rapport post-exercice',
  'exercise.generating': 'Rédaction du rapport…',
  'exercise.coverage': 'Couverture',
  'exercise.released': 'Libérés',
  'exercise.addressed': 'Traités',
  'exercise.missed': 'Manqués / en retard',
  'exercise.average': 'Réponse moyenne',
  'exercise.firstAction': 'Première action',
  'exercise.minutes': '{value} min',
  'exercise.late': 'en retard',
  'exercise.noAction': 'sans action',
  'exercise.noGaps': 'Chaque inject libéré a été traité dans sa fenêtre.',
  'exercise.narrative': 'NARRATION POST-EXERCICE',
  'exercise.lessons': 'Enseignements',
  'exercise.recommendations': 'Recommandations',
  'exercise.unresolved': 'Non résolu',
  'exercise.empty': 'Chargez l’exercice pour démarrer l’horloge, ou consignez des actions sur un inject.',
  'exercise.error': 'L’exercice n’a pas pu être noté.',

  'comm.title': 'COMMUNICATION PUBLIQUE — FULFULDE / HAOUSA',
  'comm.subtitle': 'N9 · relecture native obligatoire',
  'comm.hint':
    'Le moteur rédige un message public en fulfuldé ou en haoussa à partir de faits vérifiés uniquement. Chaque brouillon est marqué en attente de relecture native : un locuteur natif approuve la langue avant toute publication. Les contenus politiques et les conseils médicaux sont refusés d’emblée.',
  'comm.language': 'Langue',
  'comm.audience': 'Public',
  'comm.audiencePlaceholder': 'Habitants de la région de l’Adamaoua',
  'comm.jurisdiction': 'Juridiction',
  'comm.facts': 'Faits vérifiés',
  'comm.factsPlaceholder': 'Uniquement les faits confirmés par l’institution. Le modèle ne peut rien ajouter.',
  'comm.channels': 'Canaux',
  'comm.channel.radio': 'radio',
  'comm.channel.sms': 'SMS',
  'comm.channel.social': 'réseaux sociaux',
  'comm.channel.press': 'presse',
  'comm.draft': 'Rédiger le message',
  'comm.drafting': 'Rédaction…',
  'comm.reviewPending': 'RELECTURE NATIVE REQUISE',
  'comm.reviewHint': 'Un locuteur natif doit approuver chaque mot avant publication.',
  'comm.message': 'Message prêt pour la radio',
  'comm.smsLabel': 'SMS',
  'comm.keyTerms': 'Termes clés',
  'comm.term': 'Terme',
  'comm.translation': 'Traduction',
  'comm.caveats': 'Points à vérifier',
  'comm.warnings': 'Avertissements',
  'comm.blocked': 'Brouillon refusé par la politique de communication publique :',
  'comm.error': 'Le brouillon n’a pas pu être généré.',
  'comm.empty': 'Choisissez la langue, saisissez des faits vérifiés, puis rédigez le message.',
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
