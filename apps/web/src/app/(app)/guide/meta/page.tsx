'use client'

import { GuideNote, GuideSection, GuideShell, GuideTable } from '@/components/guide-shell'
import { useI18n } from '@/lib/i18n'

export default function GuideMetaPage() {
  const { t, locale } = useI18n()
  const fr = locale === 'fr'

  return (
    <GuideShell title={t('guide.meta.title')} subtitle={t('guide.meta.subtitle')} current="/guide/meta">
      <GuideSection title={fr ? 'Capacités Meta utilisées' : 'Meta capabilities used'}>
        <GuideTable
          rows={[
            {
              a: fr ? 'Raisonnement' : 'Reasoning',
              b: fr ? 'Évaluation, coordination, what-if, rédaction.' : 'Assessment, coordination, what-if, drafting.',
              c: 'muse-spark-1.3-contributor',
            },
            {
              a: fr ? 'Vision' : 'Vision',
              b: fr ? 'Transcription des zones du journal officiel scanné.' : 'Zone transcription of the scanned gazette.',
              c: 'META_VISION_MODEL',
            },
            {
              a: 'SAM',
              b: fr ? 'Détourage des tampons, signatures et tableaux.' : 'Segmentation of stamps, signatures and tables.',
              c: 'META_SAM_MODEL',
            },
            {
              a: fr ? 'Voix' : 'Voice',
              b: fr ? 'Notes vocales transformées en faits horodatés.' : 'Voice notes turned into timed facts.',
              c: 'META_VOICE_MODEL',
            },
            {
              a: 'WhatsApp Cloud API',
              b: fr ? 'Alertes utilitaires approuvées, lien de décision signé.' : 'Approved utility alerts, signed decision link.',
              c: 'Cloud API',
            },
          ]}
        />
      </GuideSection>

      <GuideSection title={fr ? 'Pourquoi le direct, sans passerelle' : 'Why direct, no gateway'}>
        <p>
          {fr
            ? 'L’API appelle graph.facebook.com directement. Les modèles de message utilitaires sont approuvés dans le compte WhatsApp Business, et l’application web reste le seul endroit où la décision est prise : aucun bouton « approuver » dans WhatsApp.'
            : 'The API calls graph.facebook.com directly. Utility message templates are approved in the WhatsApp Business account, and the web app remains the only place where a decision is made: no “approve” button inside WhatsApp.'}
        </p>
        <GuideNote>
          {fr
            ? 'Trois modèles sont approuvés : rapport joint, alerte d’échéance, demande d’approbation. Leur langue est pilotée par WHATSAPP_TEMPLATE_LANGUAGE.'
            : 'Three templates are approved: joint report, deadline alert, approval request. Their language is driven by WHATSAPP_TEMPLATE_LANGUAGE.'}
        </GuideNote>
      </GuideSection>

      <GuideSection title={fr ? 'Ce qui reste ouvert' : 'What stays open'}>
        <p>
          {fr
            ? 'En mode local ou souverain, l’API n’a besoin d’aucune clé Meta : les modèles de raisonnement, d’embedding et de rerank sont servis sur l’infrastructure de l’institution. C’est ce qui rend le projet déployable là où les données ne peuvent pas sortir.'
            : 'In local or sovereign mode, the API needs no Meta key: reasoning, embedding and rerank models are served on the institution’s infrastructure. That is what makes the project deployable where data cannot leave.'}
        </p>
      </GuideSection>
    </GuideShell>
  )
}
