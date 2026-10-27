'use client'

import { GuideNote, GuideSection, GuideShell, GuideTable } from '@/components/guide-shell'
import { useI18n } from '@/lib/i18n'

export default function GuideEnginePage() {
  const { t, locale } = useI18n()
  const fr = locale === 'fr'

  return (
    <GuideShell title={t('guide.engine.title')} subtitle={t('guide.engine.subtitle')} current="/guide/engine">
      <GuideSection title={fr ? 'Trois lentilles, un moteur' : 'Three lenses, one engine'}>
        <p>
          {fr
            ? 'La lentille ne duplique jamais le code : elle active des étapes. Simulation, maturité et hybride partagent les mêmes agences, le même retrieval et le même journal.'
            : 'A lens never duplicates code: it toggles stages. Simulation, readiness and hybrid share the same agents, retrieval and audit log.'}
        </p>
        <GuideTable
          rows={[
            {
              a: fr ? 'Simulation' : 'Simulation',
              b: fr
                ? 'Faits libérés par lots, rapports joints, conflits de mandat.'
                : 'Facts released in batches, joint reports, mandate conflicts.',
            },
            {
              a: fr ? 'Maturité' : 'Readiness',
              b: fr
                ? '13 dimensions, note 0–5, lacunes et recommandations.'
                : '13 dimensions, 0–5 score, gaps and recommendations.',
            },
            {
              a: 'Hybrid',
              b: fr
                ? 'Simulation qui produit aussi l’évaluation de maturité.'
                : 'Simulation that also produces the readiness assessment.',
            },
          ]}
        />
      </GuideSection>

      <GuideSection title={fr ? 'Agences mandatées' : 'Mandated agents'}>
        <p>
          {fr
            ? 'Chaque agence a un mandat explicite (santé publique, protection des données, télécoms, finances…). L’asymétrie d’information est volontaire : une agence ne voit que les faits qui la concernent. Le coordinateur compare ensuite les positions et rend les désaccords visibles au lieu de les lisser.'
            : 'Each agency has an explicit mandate (public health, data protection, telecoms, finance…). Information asymmetry is deliberate: an agency only sees the facts it is entitled to. The coordinator then compares positions and surfaces disagreements instead of smoothing them over.'}
        </p>
      </GuideSection>

      <GuideSection title={fr ? 'Validation des citations' : 'Citation validation'}>
        <p>
          {fr
            ? 'Un validateur relit chaque citation contre le corpus indexé. Si une citation est introuvable, la réponse est rejetée une fois puis régénérée ; à défaut, la lacune est signalée à l’opérateur — jamais masquée.'
            : 'A validator re-checks every quote against the indexed corpus. If a quote cannot be found, the answer is rejected once and regenerated; failing that, the gap is reported to the operator — never hidden.'}
        </p>
      </GuideSection>

      <GuideSection title={fr ? 'Retrieval : cloud ou souverain' : 'Retrieval: cloud or sovereign'}>
        <GuideTable
          rows={[
            {
              a: fr ? 'Cloud' : 'Cloud',
              b: fr
                ? 'Voyage voyage-4 (1024 dim), Atlas $vectorSearch + $search, fusion RRF, puis rerank-2.'
                : 'Voyage voyage-4 (1024 dim), Atlas $vectorSearch + $search, RRF fusion, then rerank-2.',
            },
            {
              a: fr ? 'Local / souverain' : 'Local / sovereign',
              b: fr
                ? 'bge-m3 + Qdrant : rien ne quitte l’institution.'
                : 'bge-m3 + Qdrant: nothing leaves the institution.',
            },
          ]}
        />
        <GuideNote>
          {fr
            ? 'Le mode est fixé par SANDBOX_MODE et visible dans le badge du fournisseur, en haut de chaque page.'
            : 'The mode is set by SANDBOX_MODE and shown in the provider badge at the top of every page.'}
        </GuideNote>
      </GuideSection>

      <GuideSection title={fr ? 'Décision humaine' : 'Human decision'}>
        <p>
          {fr
            ? 'WhatsApp transporte l’alerte et le lien signé ; la décision (approuver / rejeter) se prend dans cette console. Un jeton HMAC à durée limitée rend le lien inutilisable après expiration.'
            : 'WhatsApp carries the alert and the signed link; the decision (approve / reject) is taken in this console. A time-limited HMAC token makes the link unusable after it expires.'}
        </p>
      </GuideSection>
    </GuideShell>
  )
}
