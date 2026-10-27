'use client'

import { GuideNote, GuideSection, GuideShell, GuideSteps } from '@/components/guide-shell'
import { useI18n } from '@/lib/i18n'

export default function GuideStartPage() {
  const { t, locale } = useI18n()
  const fr = locale === 'fr'

  return (
    <GuideShell title={t('guide.start.title')} subtitle={t('guide.subtitle.short')} current="/guide/start">
      <GuideSection title={locale === 'fr' ? 'Le parcours' : 'The path'}>
        <GuideSteps
          steps={
            locale === 'fr'
              ? [
                  { title: 'Création du compte racine', body: 'Au premier démarrage, la console ouvre l’écran de configuration : prénom, nom et e-mail de l’opérateur racine. Le compte est créé avec un mot de passe aléatoire envoyé par e-mail (Resend).' },
                  { title: 'Connexion + nouveau mot de passe', body: 'Connectez-vous avec le mot de passe provisoire : la console impose immédiatement un nouveau mot de passe (12 caractères minimum, lettres et chiffres).' },
                  { title: 'Activer la 2FA', body: 'Scannez le QR code TOTP et confirmez le code à 6 chiffres. Dix codes de secours sont affichés une seule fois. Les connexions suivantes exigent le code TOTP ou un code de secours.' },
                  { title: 'Choisir un espace de travail', body: 'Pays, domaine et lentille sont partagés par toutes les pages. Le choix est mémorisé dans le navigateur et dans le profil opérateur.' },
                  { title: 'Noter la maturité', body: 'Ouvrez Maturité IA, lancez l’évaluation des 13 dimensions, puis projetez un changement de politique (what-if causal).' },
                  { title: 'Lancer un scénario de crise', body: 'Libérez les faits par lots. Chaque agence mandatée évalue à partir de ce qu’elle voit ; le coordinateur réconcilie et signale les conflits de mandat.' },
                  { title: 'Lire la chaîne d’audit', body: 'Chaque action est horodatée, hachée et chaînée. La page Journal d’audit vérifie l’intégrité de bout en bout.' },
                ]
              : [
                  { title: 'Create the root account', body: 'On first run the console opens the setup screen: first name, last name and e-mail of the root operator. The account is created with a random password mailed through Resend.' },
                  { title: 'Sign in + new password', body: 'Sign in with the temporary password: the console immediately requires a new one (12 characters minimum, letters and digits).' },
                  { title: 'Activate 2FA', body: 'Scan the TOTP QR code and confirm the 6-digit code. Ten recovery codes are shown once. Later sign-ins need the TOTP code or a recovery code.' },
                  { title: 'Pick a workspace', body: 'Country, domain and lens are shared by every page. The choice is remembered in the browser and in the operator profile.' },
                  { title: 'Score readiness', body: 'Open AI readiness, score the 13 dimensions, then project a policy change through the causal graph.' },
                  { title: 'Run a crisis scenario', body: 'Release facts in batches. Each mandated institution assesses what it can see; the coordinator reconciles and flags mandate conflicts.' },
                  { title: 'Read the audit chain', body: 'Every action is timestamped, hashed and chained. The audit page verifies the whole chain end to end.' },
                ]
          }
        />
        <GuideNote>
          {fr
            ? 'Aucun mot de passe n’est écrit dans le code ni dans une variable d’environnement : le compte racine est créé depuis l’écran de configuration, avec un mot de passe aléatoire envoyé par Resend.'
            : 'No password is hard-coded or kept in an environment variable: the root account is created from the setup screen, with a random password mailed through Resend.'}
        </GuideNote>
      </GuideSection>

      <GuideSection title={locale === 'fr' ? 'Ce que vous verrez' : 'What you will see'}>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {(fr
            ? ['Score 0–5 sur 13 dimensions', 'Conflits de mandat entre agences', 'Citations vérifiées dans le corpus', 'Journal chaîné par empreintes', 'Journal officiel scanné et indexé', 'Exercice sur table noté', 'Brouillons fulfuldé / haoussa']
            : ['0–5 score across 13 dimensions', 'Mandate conflicts between agencies', 'Quotes verified against the corpus', 'Hash-chained audit log', 'Scanned gazette segmented and indexed', 'Scored table-top exercise', 'Fulfulde / Hausa drafts']
          ).map((item) => (
            <li key={item} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-[11px]">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary dark:bg-brand-primary-light" />
              {item}
            </li>
          ))}
        </ul>
      </GuideSection>
    </GuideShell>
  )
}
