'use client'

import { ClipboardList, Clock, Flag, LifeBuoy, ScrollText } from 'lucide-react'
import {
  GuideBanner,
  GuideChecklist,
  GuideSection,
  GuideShell,
  GuideTable,
} from '@/components/guide-shell'
import { useI18n } from '@/lib/i18n'

export default function GuideOperationsPage() {
  const { t, locale } = useI18n()
  const fr = locale === 'fr'

  return (
    <GuideShell
      title={t('guide.operations.title')}
      subtitle={t('guide.operations.subtitle')}
      current="/guide/operations"
      kicker={fr ? 'Gestion · déroulés, écarts, incidents' : 'Management · runbooks, gaps, incidents'}
      meta={[
        { label: fr ? 'Cadence' : 'Cadence', value: fr ? 'Hebdomadaire' : 'Weekly' },
        { label: fr ? 'Registre' : 'Register', value: fr ? 'Écarts' : 'Gaps' },
        { label: fr ? 'Preuve' : 'Evidence', value: fr ? 'Journal chaîné' : 'Hash chain' },
      ]}
    >
      <GuideBanner tone="warning" title={fr ? 'Un écart non consigné est un incident non géré' : 'An unrecorded gap is an unmanaged incident'}>
        <p>
          {fr
            ? 'Chaque exception — citation refusée, conflit de mandat, modèle indisponible, message WhatsApp rejeté — entre dans le registre des écarts avec un responsable et une échéance. Le registre est relu en revue hebdomadaire, pas à la fin du projet.'
            : 'Every exception — rejected citation, mandate conflict, unavailable model, refused WhatsApp message — enters the gap register with an owner and a due date. The register is reviewed weekly, not at the end of the project.'}
        </p>
      </GuideBanner>

      <GuideSection title={fr ? 'Déroulé d’un exercice de crise' : 'Crisis exercise walkthrough'} icon={Clock}>
        <GuideTable
          headers={[fr ? 'Temps' : 'Time', fr ? 'Action' : 'Action', fr ? 'Responsable' : 'Owner']}
          rows={[
            {
              a: 'T+0',
              b: fr
                ? 'Cadrage : pays, domaine, lentille simulation. Le facilitateur annonce le scénario et le périmètre.'
                : 'Framing: country, domain, simulation lens. The facilitator states the scenario and the scope.',
              c: fr ? 'Facilitateur' : 'Facilitator',
            },
            {
              a: 'T+5',
              b: fr
                ? 'Libération du lot 1 de faits. Chaque agence rend une position à partir de ce qu’elle voit seulement.'
                : 'Release fact batch 1. Each agency returns a position based only on what it can see.',
              c: fr ? 'Agences' : 'Agencies',
            },
            {
              a: 'T+15',
              b: fr
                ? 'Rapport joint : le coordinateur compare les positions et inscrit les conflits de mandat.'
                : 'Joint report: the coordinator compares positions and records mandate conflicts.',
              c: fr ? 'Coordinateur' : 'Coordinator',
            },
            {
              a: 'T+25',
              b: fr
                ? 'Validation des citations, lecture du journal, décision humaine consignée.'
                : 'Citation validation, log reading, recorded human decision.',
              c: fr ? 'Opérateur' : 'Operator',
            },
            {
              a: 'T+30',
              b: fr
                ? 'Débrief : chaque écart resté ouvert rejoint le registre avec un responsable.'
                : 'Debrief: every still-open gap joins the register with an owner.',
              c: fr ? 'Tous' : 'Everyone',
            },
          ]}
        />
      </GuideSection>

      <GuideSection title={fr ? 'Registre des écarts' : 'Gap register'} icon={ClipboardList}>
        <p>
          {fr
            ? 'Le registre est la mémoire opérationnelle du dispositif. Il ne liste pas des idées, mais des manques mesurables et leur mitigation.'
            : 'The register is the operational memory of the system. It lists measurable shortfalls and their mitigation, not ideas.'}
        </p>
        <GuideTable
          headers={[fr ? 'Écart' : 'Gap', fr ? 'Mitigation en place' : 'Current mitigation', fr ? 'Statut' : 'Status']}
          rows={[
            {
              a: fr ? 'Corpus partiel' : 'Partial corpus',
              b: fr
                ? 'Le validateur rejette les citations absentes et signale la lacune au lieu d’extrapoler.'
                : 'The validator rejects missing quotes and reports the gap instead of extrapolating.',
              c: fr ? 'Maîtrisé' : 'Contained',
            },
            {
              a: fr ? 'Asymétrie de mandat' : 'Mandate asymmetry',
              b: fr
                ? 'Les conflits sont rendus visibles dans le rapport joint ; la publication reste bloquée.'
                : 'Conflicts are surfaced in the joint report; publication stays blocked.',
              c: fr ? 'Maîtrisé' : 'Contained',
            },
            {
              a: fr ? 'Langues nationales' : 'National languages',
              b: fr
                ? 'Brouillons fulfuldé / haoussa marqués « relecture native requise » — jamais publiés automatiquement.'
                : 'Fulfulde / Hausa drafts flagged “native review required” — never auto-published.',
              c: fr ? 'Ouvert' : 'Open',
            },
            {
              a: fr ? 'Canal WhatsApp non vérifié' : 'Unverified WhatsApp channel',
              b: fr
                ? 'Le webhook doit être déclaré dans le compte WhatsApp Business avant toute livraison entrante.'
                : 'The webhook must be declared in the WhatsApp Business account before any inbound delivery.',
              c: fr ? 'À faire' : 'To do',
            },
          ]}
        />
      </GuideSection>

      <GuideSection title={fr ? 'Runbook incident' : 'Incident runbook'} icon={LifeBuoy}>
        <GuideTable
          headers={[fr ? 'Symptôme' : 'Symptom', fr ? 'Première action' : 'First action', fr ? 'Escalade' : 'Escalate to']}
          rows={[
            {
              a: fr ? 'API endormie (premier appel lent)' : 'API asleep (slow first call)',
              b: fr
                ? 'Ouvrir la vue d’ensemble, attendre le badge fournisseur, ne pas relancer le run en parallèle.'
                : 'Open the overview, wait for the provider badge, do not start a parallel run.',
              c: fr ? 'Aucune' : 'None',
            },
            {
              a: fr ? 'Chaîne d’audit rompue' : 'Audit chain broken',
              b: fr
                ? 'Noter l’enregistrement nommé, geler les écritures, comparer le hash attendu et le hash stocké.'
                : 'Note the named record, freeze writes, compare expected and stored hash.',
              c: fr ? 'Racine' : 'Root',
            },
            {
              a: fr ? 'Citation rejetée en série' : 'Repeated citation rejection',
              b: fr
                ? 'Vérifier que le corpus indexé correspond au pays et au domaine sélectionnés.'
                : 'Check that the indexed corpus matches the selected country and domain.',
              c: fr ? 'Analyste' : 'Analyst',
            },
            {
              a: fr ? 'Message WhatsApp refusé' : 'WhatsApp message refused',
              b: fr
                ? 'Lire le statut de livraison : modèle non approuvé, langue non prise en charge ou numéro non opt-in.'
                : 'Read the delivery status: template not approved, unsupported language or number not opted in.',
              c: fr ? 'Communication' : 'Communications',
            },
          ]}
        />
      </GuideSection>

      <GuideSection title={fr ? 'Revue hebdomadaire' : 'Weekly review'} icon={ScrollText}>
        <GuideChecklist
          items={[
            {
              label: fr ? 'Chaîne d’audit vérifiée de bout en bout' : 'Audit chain verified end to end',
              detail: fr ? 'Vue d’ensemble + page Journal d’audit.' : 'Overview + audit log page.',
              state: 'ok',
            },
            {
              label: fr ? 'Écarts ouverts réévalués' : 'Open gaps re-assessed',
              detail: fr ? 'Chaque ligne du registre a un responsable et une échéance.' : 'Every register row has an owner and a due date.',
              state: 'watch',
            },
            {
              label: fr ? 'Codes de secours toujours détenus' : 'Recovery codes still held',
              detail: fr ? 'Au moins une copie hors ligne, dans un coffre physique.' : 'At least one offline copy in a physical safe.',
              state: 'watch',
            },
            {
              label: fr ? 'Modèles WhatsApp toujours approuvés' : 'WhatsApp templates still approved',
              detail: fr ? 'Un modèle suspendu casse la chaîne de décision.' : 'A suspended template breaks the decision chain.',
              state: 'gap',
            },
          ]}
        />
      </GuideSection>

      <GuideBanner tone="gold" title={fr ? 'La preuve, pas la promesse' : 'Evidence, not promises'}>
        <p>
          {fr
            ? 'Chaque action opérateur et moteur est horodatée, hachée et chaînée. Un run se rejoue à partir du journal : acteur, action, cible, citations. C’est ce qui rend un écart discutable et une décision défendable.'
            : 'Every operator and engine action is timestamped, hashed and chained. A run replays from the log: actor, action, target, citations. That is what makes a gap arguable and a decision defensible.'}
        </p>
      </GuideBanner>

      <GuideSection title={fr ? 'Flags de gestion' : 'Management flags'} icon={Flag}>
        <GuideTable
          headers={[fr ? 'Flag' : 'Flag', fr ? 'Décision qu’il porte' : 'Decision it carries']}
          rows={[
            {
              a: 'WEB_PUBLIC_URL',
              b: fr
                ? 'Base des liens de décision signés : doit pointer sur le domaine public, jamais sur localhost.'
                : 'Base of signed decision links: must point to the public domain, never localhost.',
            },
            {
              a: 'WHATSAPP_TEMPLATE_LANGUAGE',
              b: fr
                ? 'Langue des alertes utilitaires ; un modèle non approuvé dans cette langue est refusé.'
                : 'Language of utility alerts; a template not approved in that language is refused.',
            },
            {
              a: 'AUTH_RESEND_EMAIL_REPLY_TO',
              b: fr
                ? 'Adresse de réponse des e-mails d’accès : une boîte non relevée bloque les nouveaux opérateurs.'
                : 'Reply address for access e-mails: an unread inbox blocks new operators.',
            },
          ]}
        />
      </GuideSection>
    </GuideShell>
  )
}
