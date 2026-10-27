'use client'

import { GuideNote, GuideSection, GuideShell, GuideSteps } from '@/components/guide-shell'
import { useI18n } from '@/lib/i18n'

export default function GuideDemoPage() {
  const { t, locale } = useI18n()
  const fr = locale === 'fr'

  return (
    <GuideShell title={t('guide.demo.title')} subtitle={t('guide.demo.subtitle')} current="/guide/demo">
      <GuideSection title={fr ? 'Trois minutes, six temps' : 'Three minutes, six beats'}>
        <GuideSteps
          steps={
            fr
              ? [
                  { title: '0:00 — Connexion (20 s)', body: 'Mot de passe, puis code TOTP. Montrez que le second facteur est exigé à chaque connexion, pas seulement à l’activation.' },
                  { title: '0:20 — Vue d’ensemble (20 s)', body: 'Quatre indicateurs : fournisseur, intégrité de la chaîne, 2FA, espace de travail. C’est l’état du système, pas une maquette.' },
                  { title: '0:40 — Maturité IA (45 s)', body: 'Lancez l’évaluation du Cameroun · Santé, puis un what-if : « +1 en infrastructures numériques ». Lisez l’effet causal, pas seulement le score.' },
                  { title: '1:25 — Scénario de crise (60 s)', body: 'Mode facilitateur : libérez le premier lot, montrez l’asymétrie (chaque agence ne voit qu’une partie des faits), puis un conflit de mandat.' },
                  { title: '2:25 — Audit (20 s)', body: 'Ouvrez le journal : chaîne vérifiée, empreintes, acteur et action. Le même run est reconstructible.' },
                  { title: '2:45 — Meta (15 s)', body: 'Ouvrez la page Stack Meta : modèles Meta, WhatsApp Cloud API, et le mode souverain en repli.' },
                ]
              : [
                  { title: '0:00 — Sign in (20 s)', body: 'Password, then TOTP. Show that the second factor is required on every sign-in, not only at activation.' },
                  { title: '0:20 — Overview (20 s)', body: 'Four indicators: provider, chain integrity, 2FA, workspace. This is live state, not a mockup.' },
                  { title: '0:40 — AI readiness (45 s)', body: 'Score Cameroon · Health, then a what-if: “+1 digital infrastructure”. Read the causal effect, not just the score.' },
                  { title: '1:25 — Crisis scenario (60 s)', body: 'Facilitator mode: release the first batch, show the asymmetry (each agency sees only part of the facts), then one mandate conflict.' },
                  { title: '2:25 — Audit (20 s)', body: 'Open the log: chain verified, hashes, actor and action. The same run is reconstructible.' },
                  { title: '2:45 — Meta (15 s)', body: 'Open the Meta stack page: Meta models, WhatsApp Cloud API, and the sovereign fallback.' },
                ]
          }
        />
        <GuideNote>
          {fr
            ? 'Préparez deux onglets : la console et la page Stack Meta. Le scénario doit être lancé une fois avant la démo pour que le cold start Render soit absorbé.'
            : 'Prepare two tabs: the console and the Meta stack page. Warm the API once before the demo so the Render cold start is absorbed.'}
        </GuideNote>
      </GuideSection>

      <GuideSection title={fr ? 'Ce qu’il faut nommer' : 'What to call out'}>
        <ul className="list-disc space-y-1 pl-4">
          {(fr
            ? ['Asymétrie d’information, pas un chatbot', 'Citations vérifiées, pas des paraphrases', 'Décision humaine après alerte WhatsApp', 'Chaîne d’audit immuable', 'Repli souverain sur poids ouverts']
            : ['Information asymmetry, not a chatbot', 'Verified quotes, not paraphrases', 'Human decision after a WhatsApp alert', 'Immutable audit chain', 'Sovereign fallback on open weights']
          ).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </GuideSection>
    </GuideShell>
  )
}
