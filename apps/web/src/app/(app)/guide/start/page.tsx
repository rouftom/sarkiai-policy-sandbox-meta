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
                  { title: 'Connexion + 2FA', body: 'Saisissez operator@sarkai.demo et le mot de passe de démonstration. À la première connexion, scannez le QR code TOTP et confirmez le code : dix codes de secours sont affichés une seule fois.' },
                  { title: 'Choisir un espace de travail', body: 'Pays, domaine et lentille sont partagés par toutes les pages. Le choix est mémorisé dans le navigateur et dans le profil opérateur.' },
                  { title: 'Noter la maturité', body: 'Ouvrez Maturité IA, lancez l’évaluation des 13 dimensions, puis projetez un changement de politique (what-if causal).' },
                  { title: 'Lancer un scénario de crise', body: 'Libérez les faits par lots. Chaque agence mandatée évalue à partir de ce qu’elle voit ; le coordinateur réconcilie et signale les conflits de mandat.' },
                  { title: 'Lire la chaîne d’audit', body: 'Chaque action est horodatée, hachée et chaînée. La page Journal d’audit vérifie l’intégrité de bout en bout.' },
                ]
              : [
                  { title: 'Sign in + 2FA', body: 'Use operator@sarkai.demo and the demo password. On the first sign-in, scan the TOTP QR code and confirm the 6-digit code: ten recovery codes are shown once.' },
                  { title: 'Pick a workspace', body: 'Country, domain and lens are shared by every page. The choice is remembered in the browser and in the operator profile.' },
                  { title: 'Score readiness', body: 'Open AI readiness, score the 13 dimensions, then project a policy change through the causal graph.' },
                  { title: 'Run a crisis scenario', body: 'Release facts in batches. Each mandated institution assesses what it can see; the coordinator reconciles and flags mandate conflicts.' },
                  { title: 'Read the audit chain', body: 'Every action is timestamped, hashed and chained. The audit page verifies the whole chain end to end.' },
                ]
          }
        />
        <GuideNote>
          {fr
            ? 'Le compte de démonstration est créé au démarrage de l’API depuis SPS_OPERATOR_EMAIL / SPS_OPERATOR_PASSWORD. Aucun mot de passe n’est écrit dans le code.'
            : 'The demo operator is seeded when the API boots, from SPS_OPERATOR_EMAIL / SPS_OPERATOR_PASSWORD. No password is hard-coded.'}
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
