'use client'

import { Cpu, Database, Flag, Gauge, ShieldCheck, Waypoints } from 'lucide-react'
import {
  GuideBanner,
  GuideChecklist,
  GuideSection,
  GuideShell,
  GuideTable,
} from '@/components/guide-shell'
import { useI18n } from '@/lib/i18n'

/** The 13 readiness dimensions, explained for the guide (names match the scoring engine). */
const READINESS_EXPLAINED = [
  { id: 1, en: 'Data/Model Marketplace', fr: 'Marché des données et des modèles', whatEn: 'Access to usable, licensed datasets and models for public and private actors.', whatFr: 'Accès à des données et modèles exploitables, sous licence claire, pour les acteurs publics et privés.' },
  { id: 2, en: 'Generated Content Marketplace', fr: 'Marché des contenus générés', whatEn: 'Rules and channels for AI-generated content: ownership, labelling, distribution.', whatFr: 'Règles et circuits pour les contenus générés par IA : propriété, étiquetage, diffusion.' },
  { id: 3, en: 'Cross-Domain Correlation Analysis', fr: 'Analyse croisée entre domaines', whatEn: 'Ability to link data across sectors (health, education, finance) without losing control.', whatFr: 'Capacité à relier des données entre secteurs (santé, éducation, finance) sans perdre le contrôle.' },
  { id: 4, en: 'Contextualization and Regional Impact', fr: 'Contextualisation et impact régional', whatEn: 'Whether AI is adapted to local languages, realities and regional effects.', whatFr: 'Adaptation de l’IA aux langues, réalités et effets régionaux locaux.' },
  { id: 5, en: 'Level of Integration of AI in Workflows', fr: 'Intégration de l’IA dans les processus', whatEn: 'How far AI is embedded in real administrative and service workflows.', whatFr: 'Niveau d’intégration de l’IA dans les processus administratifs et de service réels.' },
  { id: 6, en: 'Human Interface', fr: 'Interface humaine', whatEn: 'Usability and human oversight: how people see, question and correct AI outputs.', whatFr: 'Ergonomie et supervision humaine : comment les personnes voient, contestent et corrigent les sorties de l’IA.' },
  { id: 7, en: 'Strategy Alignment', fr: 'Alignement stratégique', whatEn: 'Coherence between the national AI strategy, budgets and sector plans.', whatFr: 'Cohérence entre la stratégie nationale d’IA, les budgets et les plans sectoriels.' },
  { id: 8, en: 'Collaboration with AI', fr: 'Collaboration avec l’IA', whatEn: 'Working practices where people and AI systems share tasks and accountability.', whatFr: 'Pratiques de travail où personnes et systèmes d’IA partagent les tâches et les responsabilités.' },
  { id: 9, en: 'Impacts of Humans in AI Integration', fr: 'Impact humain de l’intégration', whatEn: 'Effects on jobs, skills and training, and how they are anticipated.', whatFr: 'Effets sur l’emploi, les compétences et la formation, et manière dont ils sont anticipés.' },
  { id: 10, en: 'AI & Policies', fr: 'IA et politiques publiques', whatEn: 'Existence and enforcement of AI rules: liability, audit, redress.', whatFr: 'Existence et application des règles sur l’IA : responsabilité, audit, recours.' },
  { id: 11, en: 'AI for Inclusion', fr: 'IA pour l’inclusion', whatEn: 'Whether AI services reach women, rural citizens, people with disabilities and other excluded groups.', whatFr: 'Atteinte par les services d’IA des femmes, des populations rurales, des personnes handicapées et autres groupes exclus.' },
  { id: 12, en: 'Granular Priorities', fr: 'Priorités opérationnelles', whatEn: 'Concrete, costed priorities with owners and dates, not only general intentions.', whatFr: 'Priorités concrètes, chiffrées, avec responsables et échéances, et non seulement des intentions générales.' },
  { id: 13, en: 'Digital Infrastructure', fr: 'Infrastructure numérique', whatEn: 'Connectivity, compute, data centres and public cloud able to host AI workloads.', whatFr: 'Connectivité, calcul, centres de données et cloud public capables d’accueillir des charges d’IA.' },
]

export default function GuideEnginePage() {
  const { t, locale } = useI18n()
  const fr = locale === 'fr'

  return (
    <GuideShell
      title={t('guide.engine.title')}
      subtitle={t('guide.engine.subtitle')}
      current="/guide/engine"
      kicker={fr ? 'Moteur · lentilles et garanties' : 'Engine · lenses and guarantees'}
      meta={[
        { label: fr ? 'Lentilles' : 'Lenses', value: '3' },
        { label: fr ? 'Agences' : 'Agencies', value: '5' },
        { label: fr ? 'Dimensions' : 'Dimensions', value: '13' },
      ]}
    >
      <GuideBanner tone="info" title={fr ? 'Une lentille active des étapes, elle ne duplique pas le code' : 'A lens toggles stages, it never duplicates code'}>
        <p>
          {fr
            ? 'Simulation, maturité et hybride partagent les mêmes agences, le même retrieval et le même journal. Changer de lentille change la profondeur du parcours, jamais la provenance des réponses.'
            : 'Simulation, readiness and hybrid share the same agents, retrieval and audit log. Switching lens changes the depth of the path, never where the answers come from.'}
        </p>
      </GuideBanner>

      <GuideSection title={fr ? 'Ce que chaque lentille exécute' : 'What each lens runs'} icon={Cpu}>
        <GuideTable
          headers={[fr ? 'Lentille' : 'Lens', fr ? 'Étapes actives' : 'Active stages', fr ? 'Quand l’utiliser' : 'When to use it']}
          rows={[
            {
              a: fr ? 'Simulation' : 'Simulation',
              b: fr
                ? 'Faits libérés par lots, rapports joints, conflits de mandat.'
                : 'Facts released in batches, joint reports, mandate conflicts.',
              c: fr ? 'Crise, exercice sur table' : 'Crisis, table-top exercise',
            },
            {
              a: fr ? 'Maturité' : 'Readiness',
              b: fr
                ? '13 dimensions, note de 0 à 5, lacunes et recommandations.'
                : '13 dimensions, 0 to 5 score, gaps and recommendations.',
              c: fr ? 'Diagnostic, arbitrage budgétaire' : 'Diagnosis, budget arbitration',
            },
            {
              a: 'Hybrid',
              b: fr
                ? 'Simulation qui produit aussi l’évaluation de maturité.'
                : 'Simulation that also produces the readiness assessment.',
              c: fr ? 'Revue de direction' : 'Executive review',
            },
          ]}
        />
      </GuideSection>

      <GuideSection title={fr ? 'Les 13 dimensions de maturité IA' : 'The 13 AI-readiness dimensions'} icon={Gauge}>
        <p>
          {fr
            ? 'Chaque dimension reçoit une note de 0 à 5 (0 non commencé, 3 établi, 5 leader). La note s’appuie sur les textes du pays, comparés aux bonnes pratiques mondiales, et sur une recherche web en direct quand elle est disponible. Les dimensions sont regroupées en six facteurs : données, open source, standards, recherche, déploiement et bac à sable.'
            : 'Each dimension gets a score from 0 to 5 (0 not started, 3 established, 5 leading). The score rests on the country’s texts, compared with global best practice, and on a live web search when it is available. The dimensions group into six factors: data, open source, standards, research, deployment and sandbox.'}
        </p>
        <GuideTable
          headers={['#', fr ? 'Dimension' : 'Dimension', fr ? 'Ce qu’elle mesure' : 'What it measures']}
          rows={READINESS_EXPLAINED.map((entry) => ({
            a: String(entry.id),
            b: fr ? entry.fr : entry.en,
            c: fr ? entry.whatFr : entry.whatEn,
          }))}
        />
      </GuideSection>

      <GuideSection title={fr ? 'Asymétrie d’information, assumée' : 'Information asymmetry, by design'} icon={Waypoints}>
        <p>
          {fr
            ? 'Chaque agence ne reçoit que les faits couverts par son mandat (santé publique, protection des données, télécoms, finances, autorité locale). Le coordinateur compare ensuite les positions et rend les désaccords visibles au lieu de les lisser : un conflit de mandat est une sortie, pas un défaut.'
            : 'Each agency only receives the facts its mandate covers (public health, data protection, telecoms, finance, local authority). The coordinator then compares positions and surfaces disagreements instead of smoothing them over: a mandate conflict is an output, not a defect.'}
        </p>
        <GuideBanner tone="warning" title={fr ? 'Un désaccord non traité bloque la publication' : 'An unhandled disagreement blocks publication'}>
          <p>
            {fr
              ? 'Tant qu’un conflit reste ouvert, le rapport joint porte la mention « positions divergentes » et ne peut pas servir de base à une communication officielle.'
              : 'While a conflict stays open, the joint report carries a “divergent positions” note and cannot be used as the basis for an official communication.'}
          </p>
        </GuideBanner>
      </GuideSection>

      <GuideSection title={fr ? 'Validation des citations' : 'Citation validation'} icon={ShieldCheck}>
        <p>
          {fr
            ? 'Un validateur relit chaque citation contre le corpus indexé. Une citation introuvable fait rejeter la réponse une fois, puis régénérer ; à défaut, la lacune est signalée à l’opérateur, jamais masquée.'
            : 'A validator re-checks every quote against the indexed corpus. An unfindable quote makes the answer rejected once, then regenerated; failing that, the gap is reported to the operator, never hidden.'}
        </p>
        <GuideChecklist
          items={[
            {
              label: fr ? 'Citation vérifiée' : 'Citation verified',
              detail: fr ? 'Le texte et l’article existent dans le corpus indexé.' : 'The text and article exist in the indexed corpus.',
              state: 'ok',
            },
            {
              label: fr ? 'Vérifiée après régénération' : 'Verified after regeneration',
              detail: fr ? 'La première réponse citait un passage absent ; la seconde est retenue.' : 'The first answer quoted a missing passage; the second is kept.',
              state: 'watch',
            },
            {
              label: fr ? 'Rejetée' : 'Rejected',
              detail: fr ? 'Aucune source valable : la réponse est refusée et l’écart est consigné.' : 'No valid source: the answer is refused and the gap is recorded.',
              state: 'gap',
            },
          ]}
        />
      </GuideSection>

      <GuideSection title={fr ? 'Retrieval : cloud ou souverain' : 'Retrieval: cloud or sovereign'} icon={Database}>
        <GuideTable
          headers={[fr ? 'Mode' : 'Mode', fr ? 'Chaîne' : 'Pipeline', fr ? 'Sortie réseau' : 'Network egress']}
          rows={[
            {
              a: fr ? 'Cloud' : 'Cloud',
              b: fr
                ? 'Voyage voyage-4 (1024 dim), Atlas $vectorSearch + $search, fusion RRF, rerank-2.'
                : 'Voyage voyage-4 (1024 dim), Atlas $vectorSearch + $search, RRF fusion, rerank-2.',
              c: fr ? 'Vers Meta / Atlas' : 'To Meta / Atlas',
            },
            {
              a: fr ? 'Local / souverain' : 'Local / sovereign',
              b: fr
                ? 'bge-m3 + Qdrant : rien ne quitte l’institution.'
                : 'bge-m3 + Qdrant: nothing leaves the institution.',
              c: fr ? 'Aucune' : 'None',
            },
          ]}
        />
        <GuideBanner tone="success" title={fr ? 'Le mode est vérifiable depuis l’UI' : 'The mode is verifiable from the UI'}>
          <p>
            {fr
              ? 'Le badge fournisseur, en haut de chaque page, indique le mode, le modèle de raisonnement et la résidence. En mode souverain, la clé Meta n’est jamais appelée.'
              : 'The provider badge at the top of every page shows the mode, the reasoning model and the residency. In sovereign mode the Meta key is never called.'}
          </p>
        </GuideBanner>
      </GuideSection>

      <GuideSection title={fr ? 'Flags du moteur' : 'Engine flags'} icon={Flag}>
        <GuideTable
          headers={[fr ? 'Flag' : 'Flag', fr ? 'Ce qu’il change' : 'What it changes']}
          rows={[
            {
              a: 'SANDBOX_MODE',
              b: fr
                ? 'Fournisseur de raisonnement, d’embedding et de rerank ; visible dans le badge.'
                : 'Reasoning, embedding and rerank provider; shown in the badge.',
            },
            {
              a: 'META_SAM_MODEL',
              b: fr
                ? 'Modèles de lecture du journal officiel scanné (zones, tampons, tableaux).'
                : 'Models that read the scanned gazette (zones, stamps, tables).',
            },
            {
              a: 'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
              b: fr
                ? 'Jeton de vérification du webhook ; sans lui, aucune livraison entrante n’est acceptée.'
                : 'Webhook verify token; without it no inbound delivery is accepted.',
            },
          ]}
        />
      </GuideSection>
    </GuideShell>
  )
}
