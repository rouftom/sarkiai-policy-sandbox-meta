'use client'

import { MessageSquare, ShieldCheck, Sparkles, Workflow } from 'lucide-react'
import {
  GuideBanner,
  GuideChecklist,
  GuideSection,
  GuideShell,
  GuideTable,
} from '@/components/guide-shell'
import { useI18n } from '@/lib/i18n'

export default function GuideMetaPage() {
  const { t, locale } = useI18n()
  const fr = locale === 'fr'

  return (
    <GuideShell
      title={t('guide.meta.title')}
      subtitle={t('guide.meta.subtitle')}
      current="/guide/meta"
      kicker={fr ? 'Meta · capacités et exploitation' : 'Meta · capabilities and operation'}
      meta={[
        { label: fr ? 'Modèles' : 'Models', value: '4' },
        { label: fr ? 'Modèles WA' : 'WA templates', value: '3' },
        { label: fr ? 'Passerelle' : 'Gateway', value: fr ? 'Aucune' : 'None' },
      ]}
    >
      <GuideBanner tone="info" title={fr ? 'Appel direct, sans passerelle' : 'Direct call, no gateway'}>
        <p>
          {fr
            ? 'L’API appelle graph.facebook.com directement. Les modèles utilitaires sont approuvés dans le compte WhatsApp Business, et la décision se prend uniquement dans cette application web : aucun bouton « approuver » dans WhatsApp.'
            : 'The API calls graph.facebook.com directly. Utility templates are approved in the WhatsApp Business account, and the decision is only taken in this web app: no “approve” button inside WhatsApp.'}
        </p>
      </GuideBanner>

      <GuideSection title={fr ? 'Capacités Meta utilisées, et où' : 'Meta capabilities, and where'} icon={Sparkles}>
        <GuideTable
          headers={[fr ? 'Capacité' : 'Capability', fr ? 'Usage opérationnel' : 'Operational use', fr ? 'Variable / modèle' : 'Variable / model']}
          rows={[
            {
              a: fr ? 'Raisonnement' : 'Reasoning',
              b: fr ? 'Évaluation, coordination, what-if, rédaction des brouillons.' : 'Assessment, coordination, what-if, draft writing.',
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
              c: 'graph.facebook.com',
            },
          ]}
        />
      </GuideSection>

      <GuideSection title={fr ? 'Chaîne de décision WhatsApp' : 'WhatsApp decision chain'} icon={Workflow}>
        <GuideTable
          headers={[fr ? 'Étape' : 'Step', fr ? 'Ce qui se passe' : 'What happens', fr ? 'Preuve conservée' : 'Evidence kept']}
          rows={[
            {
              a: fr ? 'Alerte' : 'Alert',
              b: fr
                ? 'Un modèle utilitaire approuvé part avec un lien signé à durée limitée.'
                : 'An approved utility template goes out with a time-limited signed link.',
              c: fr ? 'Statut de livraison' : 'Delivery status',
            },
            {
              a: fr ? 'Ouverture' : 'Open',
              b: fr
                ? 'L’opérateur s’authentifie (mot de passe + 2FA) avant de voir la demande.'
                : 'The operator authenticates (password + 2FA) before seeing the request.',
              c: fr ? 'Événement de session' : 'Session event',
            },
            {
              a: fr ? 'Décision' : 'Decision',
              b: fr
                ? 'Approbation ou rejet dans la console, avec motif et pièces jointes.'
                : 'Approve or reject in the console, with a reason and attachments.',
              c: fr ? 'Action journalisée' : 'Logged action',
            },
            {
              a: fr ? 'Clôture' : 'Close',
              b: fr
                ? 'Le jeton est consommé ; le lien rejoué ne produit plus d’effet.'
                : 'The token is consumed; a replayed link has no effect.',
              c: fr ? 'Hash du run' : 'Run hash',
            },
          ]}
        />
      </GuideSection>

      <GuideSection title={fr ? 'Exploitation des modèles approuvés' : 'Operating the approved templates'} icon={MessageSquare}>
        <GuideChecklist
          items={[
            {
              label: fr ? 'Trois modèles approuvés' : 'Three approved templates',
              detail: fr
                ? 'Rapport joint, alerte d’échéance, demande d’approbation.'
                : 'Joint report, deadline alert, approval request.',
              state: 'ok',
            },
            {
              label: fr ? 'Langue pilotée par variable' : 'Language driven by a flag',
              detail: fr
                ? 'WHATSAPP_TEMPLATE_LANGUAGE doit correspondre à une langue réellement approuvée.'
                : 'WHATSAPP_TEMPLATE_LANGUAGE must match a language that is actually approved.',
              state: 'watch',
            },
            {
              label: fr ? 'Webhook déclaré' : 'Webhook declared',
              detail: fr
                ? 'Callback sur /v1/whatsapp/webhook, champ messages, jeton de vérification.'
                : 'Callback on /v1/whatsapp/webhook, messages field, verify token.',
              state: 'gap',
            },
          ]}
        />
      </GuideSection>

      <GuideBanner tone="success" title={fr ? 'Le repli souverain reste opérationnel' : 'The sovereign fallback stays operational'}>
        <p>
          {fr
            ? 'En mode local ou souverain, l’API n’a besoin d’aucune clé Meta : raisonnement, embedding et rerank sont servis sur l’infrastructure de l’institution. C’est ce qui rend le dispositif déployable là où les données ne peuvent pas sortir — et c’est vérifiable dans le badge fournisseur.'
            : 'In local or sovereign mode, the API needs no Meta key: reasoning, embedding and rerank are served on the institution’s infrastructure. That is what makes the system deployable where data cannot leave — and it is verifiable in the provider badge.'}
        </p>
      </GuideBanner>

      <GuideSection title={fr ? 'Limites assumées' : 'Accepted limits'} icon={ShieldCheck}>
        <ul className="grid gap-1.5">
          {(fr
            ? [
                'Les modèles utilitaires doivent être réapprouvés à chaque changement de texte : un modèle suspendu interrompt la chaîne de décision.',
                'Le webhook ne peut pas être déclaré depuis l’application : c’est une action dans le compte WhatsApp Business.',
                'Un numéro non opt-in ne reçoit rien, même avec un modèle approuvé.',
              ]
            : [
                'Utility templates must be re-approved on every copy change: a suspended template breaks the decision chain.',
                'The webhook cannot be declared from the application: it is an action in the WhatsApp Business account.',
                'A number that has not opted in receives nothing, even with an approved template.',
              ]
          ).map((item) => (
            <li key={item} className="flex items-start gap-2 rounded-lg border border-border px-2.5 py-1.5 text-[11px]">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-accent" />
              {item}
            </li>
          ))}
        </ul>
      </GuideSection>
    </GuideShell>
  )
}
