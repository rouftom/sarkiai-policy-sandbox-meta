'use client'

import { BookOpen, Compass, Flag, Users } from 'lucide-react'
import {
  GuideBanner,
  GuideChecklist,
  GuideSection,
  GuideShell,
  GuideSteps,
  GuideTable,
} from '@/components/guide-shell'
import { useI18n } from '@/lib/i18n'

export default function GuideStartPage() {
  const { t, locale } = useI18n()
  const fr = locale === 'fr'

  return (
    <GuideShell
      title={t('guide.start.title')}
      subtitle={t('guide.subtitle.short')}
      current="/guide/start"
      kicker={fr ? 'Déroulé · prise de poste' : 'Runbook · taking over'}
      meta={[
        { label: fr ? 'Durée' : 'Duration', value: fr ? '≈ 20 min' : '≈ 20 min' },
        { label: fr ? 'Responsable' : 'Owner', value: fr ? 'Opérateur racine' : 'Root operator' },
        { label: fr ? 'Sortie' : 'Output', value: fr ? '1er run audité' : 'First audited run' },
      ]}
    >
      <GuideSection title={fr ? 'Le sigle SPS' : 'What SPS stands for'} icon={BookOpen}>
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          {fr
            ? 'SPS signifie SarkiAI Policy Sandbox : le bac à sable de politiques publiques de SarkiAI. C’est une console opérateur qui simule des crises, mesure la maturité IA et notifie les points focaux, avec un journal d’audit chaîné par hachage.'
            : 'SPS stands for SarkiAI Policy Sandbox: the public-policy sandbox of SarkiAI. It is an operator console that simulates crises, scores AI readiness and notifies focal points, with a hash-chained audit log.'}
        </p>
      </GuideSection>

      <GuideBanner tone="gold" title={fr ? 'Ce que la console fait, et ne fait pas' : 'What the console does, and does not do'}>
        <p>
          {fr
            ? 'Le moteur rassemble des faits, les fait évaluer par des agences mandatées, vérifie chaque citation contre le corpus, puis journalise la décision. Il ne publie pas, n’envoie pas de message officiel et ne remplace aucun signataire : chaque sortie attend une validation humaine.'
            : 'The engine gathers facts, has mandated institutions assess them, verifies every quote against the corpus, then logs the decision. It never publishes, never sends an official message and never replaces a signatory: every output waits for human validation.'}
        </p>
      </GuideBanner>

      <GuideSection title={fr ? 'Rôles et garde-fous' : 'Roles and guardrails'} icon={Users}>
        <GuideTable
          headers={[fr ? 'Rôle' : 'Role', fr ? 'Ce qu’il fait' : 'What it does', fr ? 'Garde-fou' : 'Guardrail']}
          rows={[
            {
              a: fr ? 'Opérateur racine' : 'Root operator',
              b: fr
                ? 'Crée les comptes, garde les codes de secours, lit le journal.'
                : 'Creates accounts, holds recovery codes, reads the log.',
              c: fr ? '2FA obligatoire' : '2FA enforced',
            },
            {
              a: fr ? 'Analyste' : 'Analyst',
              b: fr
                ? 'Lance les évaluations de maturité et les scénarios.'
                : 'Runs readiness assessments and scenarios.',
              c: fr ? 'Lecture seule sur l’audit' : 'Read-only audit',
            },
            {
              a: fr ? 'Point focal institutionnel' : 'Institutional focal point',
              b: fr
                ? 'Valide la position de son agence, signale un conflit de mandat.'
                : 'Confirms its agency position, flags a mandate conflict.',
              c: fr ? 'Périmètre limité à son mandat' : 'Scoped to its mandate',
            },
          ]}
        />
      </GuideSection>

      <GuideSection title={fr ? 'Déroulé de la première mise en service' : 'First-run procedure'} icon={Compass}>
        <GuideSteps
          steps={[
            {
              title: fr ? 'Créer le compte racine depuis /setup' : 'Create the root account from /setup',
              body: fr
                ? 'La base est vide : la console ouvre l’écran de configuration (prénom, nom, e-mail). Un mot de passe provisoire de 20 caractères est envoyé à l’adresse indiquée. Si l’e-mail échoue, le compte est annulé, jamais de compte sans mot de passe reçu.'
                : 'The store is empty: the console opens the setup screen (first name, last name, e-mail). A 20-character temporary password is mailed to that address. If the mail fails, the account is rolled back, never an account without a delivered password.',
              owner: fr ? 'Racine' : 'Root',
            },
            {
              title: fr ? 'Remplacer le mot de passe, puis activer la 2FA' : 'Replace the password, then enrol 2FA',
              body: fr
                ? 'Le mot de passe provisoire expire après 12 minutes et doit être remplacé (12 caractères minimum, lettres et chiffres). Le QR code TOTP suit immédiatement ; dix codes de secours sont affichés une seule fois, téléchargez-les avant de continuer.'
                : 'The temporary password expires after 12 minutes and must be replaced (12 characters minimum, letters and digits). The TOTP QR code follows immediately; ten recovery codes are shown once, download them before continuing.',
              owner: fr ? 'Racine' : 'Root',
            },
            {
              title: fr ? 'Fixer l’espace de travail' : 'Set the workspace',
              body: fr
                ? 'Pays, domaine et lentille sont partagés par toutes les pages et enregistrés dans le profil. Une démo correcte commence par vérifier que ces trois valeurs sont celles annoncées.'
                : 'Country, domain and lens are shared by every page and stored on the profile. A correct run starts by checking that these three values are the announced ones.',
              owner: fr ? 'Analyste' : 'Analyst',
            },
            {
              title: fr ? 'Chauffer l’API avant le premier run' : 'Warm the API before the first run',
              body: fr
                ? 'Le service gratuit s’endort : le premier appel peut prendre 40 secondes. Ouvrez la vue d’ensemble une fois, attendez le badge fournisseur, puis lancez le scénario.'
                : 'The free service sleeps: the first call can take 40 seconds. Open the overview once, wait for the provider badge, then run the scenario.',
              owner: fr ? 'Analyste' : 'Analyst',
            },
            {
              title: fr ? 'Produire un run auditable' : 'Produce one auditable run',
              body: fr
                ? 'Libérez le premier lot de faits, laissez chaque agence rendre sa position, puis ouvrez le journal : la chaîne doit être vérifiée et le run reconstructible.'
                : 'Release the first batch of facts, let each agency return its position, then open the log: the chain must verify and the run must be reconstructible.',
              owner: fr ? 'Analyste' : 'Analyst',
            },
          ]}
        />
      </GuideSection>

      <GuideSection title={fr ? 'Contrôles du premier jour' : 'Day-one checks'} icon={BookOpen}>
        <GuideChecklist
          items={[
            {
              label: fr ? 'Deux facteurs exigés à chaque connexion' : 'Second factor required on every sign-in',
              detail: fr
                ? 'Déconnectez-vous puis reconnectez-vous : le code TOTP doit être demandé, pas seulement à l’activation.'
                : 'Sign out and back in: the TOTP code must be requested, not only at enrolment.',
              state: 'ok',
            },
            {
              label: fr ? 'Codes de secours hors ligne' : 'Recovery codes offline',
              detail: fr
                ? 'Les codes ne sont plus jamais affichés. Un fichier perdu impose une réinitialisation manuelle.'
                : 'Codes are never shown again. A lost file forces a manual reset.',
              state: 'watch',
            },
            {
              label: fr ? 'Chaîne d’audit vérifiée' : 'Audit chain verified',
              detail: fr
                ? 'La vue d’ensemble affiche « Vérifiée » et le nombre d’enregistrements. Une chaîne rompue nomme l’enregistrement fautif.'
                : 'The overview shows “Verified” and the record count. A broken chain names the offending record.',
              state: 'ok',
            },
            {
              label: fr ? 'Mode de retrieval annoncé' : 'Retrieval mode announced',
              detail: fr
                ? 'Le badge fournisseur dit si le raisonnement tourne dans le cloud Meta ou sur site. En souverain, aucune clé Meta n’est appelée.'
                : 'The provider badge says whether reasoning runs in the Meta cloud or on-premise. In sovereign mode no Meta key is called.',
              state: 'ok',
            },
          ]}
        />
      </GuideSection>

      <GuideSection title={fr ? 'Flags à connaître (noms seulement)' : 'Flags worth knowing (names only)'} icon={Flag}>
        <p>
          {fr
            ? 'Aucune valeur de secret n’est affichée ni documentée ici. Ces variables changent le comportement visible de la console :'
            : 'No secret value is displayed or documented here. These variables change what the console visibly does:'}
        </p>
        <GuideTable
          headers={[fr ? 'Variable' : 'Variable', fr ? 'Effet visible' : 'Visible effect']}
          rows={[
            {
              a: 'SANDBOX_MODE',
              b: fr
                ? 'cloud / sovereign / local : choisit le fournisseur de raisonnement et de retrieval.'
                : 'cloud / sovereign / local: picks the reasoning and retrieval provider.',
            },
            {
              a: 'WHATSAPP_TEMPLATE_LANGUAGE',
              b: fr
                ? 'Langue demandée pour les trois modèles utilitaires approuvés.'
                : 'Language requested for the three approved utility templates.',
            },
            {
              a: 'WEB_PUBLIC_URL',
              b: fr
                ? 'Base des liens signés envoyés dans un message WhatsApp.'
                : 'Base of the signed links carried by a WhatsApp message.',
            },
            {
              a: 'AUTH_RESEND_EMAIL_FROM',
              b: fr
                ? 'Expéditeur du mot de passe provisoire. Un domaine non vérifié bloque /setup.'
                : 'Sender of the temporary password. An unverified domain blocks /setup.',
            },
          ]}
        />
      </GuideSection>
    </GuideShell>
  )
}
