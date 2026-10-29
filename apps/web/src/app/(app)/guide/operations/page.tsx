'use client'

import { ClipboardList, Clock, Flag, LifeBuoy, ScrollText, Workflow } from 'lucide-react'
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
            ? 'Chaque exception, citation refusée, conflit de mandat, modèle indisponible, message WhatsApp rejeté, entre dans le registre des écarts avec un responsable et une échéance. Le registre est relu en revue hebdomadaire, pas à la fin du projet.'
            : 'Every exception, rejected citation, mandate conflict, unavailable model, refused WhatsApp message, enters the gap register with an owner and a due date. The register is reviewed weekly, not at the end of the project.'}
        </p>
      </GuideBanner>

      <GuideSection title={fr ? 'Déroulé d’un exercice de crise' : 'Crisis exercise walkthrough'} icon={Clock}>
        <GuideTable
          headers={[fr ? 'Temps' : 'Time', fr ? 'Action' : 'Action', fr ? 'Responsable' : 'Owner']}
          rows={[
            {
              a: 'T+0',
              b: fr
                ? 'Cadrage : pays, secteur, mode facilitateur ou automatique. Le facilitateur annonce le scénario et le périmètre.'
                : 'Framing: country, sector, facilitator or automatic mode. The facilitator states the scenario and the scope.',
              c: fr ? 'Facilitateur' : 'Facilitator',
            },
            {
              a: 'T+5',
              b: fr
                ? 'Libération du lot 1 : bouton « Libérer le bloc suivant », ou icône play sur un fait de la chronologie. Chaque agence rend une position à partir de ce qu’elle voit seulement.'
                : 'Release batch 1: “Release next batch”, or the play icon on a timeline fact. Each agency returns a position based only on what it can see.',
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

      <GuideSection title={fr ? 'Console des scénarios : du run à la preuve' : 'Scenario console: from run to evidence'} icon={Workflow}>
        <GuideTable
          headers={[fr ? 'Élément' : 'Element', fr ? 'Ce qu’on y fait' : 'What you do there', fr ? 'Ce qui reste' : 'What stays']}
          rows={[
            {
              a: fr ? 'Table des runs' : 'Run table',
              b: fr
                ? 'Recherche, filtre secteur ou statut, ouverture d’un run à sa propre adresse. Le retour ramène à la liste.'
                : 'Search, sector or status filter, open a run at its own address. Back returns to the list.',
              c: fr ? 'Progression, statut, motif d’échec' : 'Progress, status, failure reason',
            },
            {
              a: fr ? 'Carrousel de processus' : 'Process carousel',
              b: fr
                ? 'Un processus par secteur : graphe du run, chronologie de l’incident, résultats des agents et sources citées.'
                : 'One process per sector: run graph, incident timeline, agent outputs and cited sources.',
              c: fr ? 'Rapports joints et citations' : 'Joint reports and citations',
            },
            {
              a: fr ? 'Pas à pas (facilitateur)' : 'Step by step (facilitator)',
              b: fr
                ? 'Icône play sur un fait de la chronologie, ou « Libérer le bloc suivant ». Un clic sur un nœud du graphe ouvre son détail : état, faits, audience, sortie réconciliée.'
                : 'Play icon on a timeline fact, or “Release next batch”. A click on a graph node opens its detail: state, facts, audience, reconciled output.',
              c: fr ? 'Un rapport par bloc libéré' : 'One report per released batch',
            },
            {
              a: fr ? 'Reprise' : 'Resume',
              b: fr
                ? 'Un run interrompu ou en échec repart du dernier lot validé ; les tours déjà joués ne sont pas rejoués.'
                : 'An interrupted or failed run resumes from the last released batch; earlier rounds are not replayed.',
              c: fr ? 'État du run et rapports existants' : 'Run state and existing reports',
            },
            {
              a: fr ? 'Export' : 'Export',
              b: fr ? 'HTML, Markdown, Word ou JSON depuis la barre du processus.' : 'HTML, Markdown, Word or JSON from the process toolbar.',
              c: fr ? 'Fichier téléchargé, run inchangé' : 'Downloaded file, run unchanged',
            },
            {
              a: fr ? 'CoT et audit' : 'CoT and audit',
              b: fr ? 'Panneau sous le run : raisonnement par agent, intégrité de la chaîne.' : 'Panel below the run: reasoning per agent, chain integrity.',
              c: fr ? 'Journal chaîné, en ajout seul' : 'Append-only hash chain',
            },
            {
              a: fr ? 'Suppression' : 'Delete',
              b: fr
                ? 'Icône corbeille et confirmation. Le run et ses rapports disparaissent de la liste.'
                : 'Trash icon and confirmation. The run and its reports leave the list.',
              c: fr ? 'Traces d’audit et CoT conservées' : 'Audit and CoT traces kept',
            },
          ]}
        />
        <p className="text-[11px] text-muted-foreground">
          {fr
            ? 'La suppression efface le run et ses rapports, jamais la preuve : le raisonnement et les entrées d’audit restent dans le journal, avec leur hash. Un run se rejoue donc encore après sa suppression.'
            : 'Deletion removes the run and its reports, never the evidence: reasoning and audit entries stay in the journal with their hash. A run can still be replayed after it is deleted.'}
        </p>
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
                ? 'Brouillons fulfuldé / haoussa marqués « relecture native requise », jamais publiés automatiquement.'
                : 'Fulfulde / Hausa drafts flagged “native review required”, never auto-published.',
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
