'use client';

import { useState, useEffect } from 'react';
import { optOut, optIn, isCurrentlyOptedOut } from '@/lib/hooks/useAnalytics';

export default function ConfidentialitePage() {
  const [isOptedOut, setIsOptedOut] = useState(false);

  useEffect(() => {
    setIsOptedOut(isCurrentlyOptedOut());
  }, []);

  const handleToggle = () => {
    if (isOptedOut) {
      optIn();
      setIsOptedOut(false);
    } else {
      optOut();
      setIsOptedOut(true);
    }
  };

  return (
    <main className="min-h-screen">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <h1 className="text-2xl font-bold text-slate-100 mb-8">
          Politique de confidentialité
        </h1>

        <div className="space-y-8 text-slate-300 text-sm leading-relaxed">
          {/* Section 1 */}
          <section>
            <h2 className="text-lg font-semibold text-slate-100 mb-3">
              Mesure d&apos;audience
            </h2>
            <p>
              Ce site utilise un système de mesure d&apos;audience développé en interne,
              hébergé sur notre propre infrastructure. Aucun service tiers (Google Analytics,
              Facebook Pixel, etc.) n&apos;est utilisé. Les données collectées ne sont jamais
              partagées avec des tiers.
            </p>
          </section>

          {/* Section 2 */}
          <section>
            <h2 className="text-lg font-semibold text-slate-100 mb-3">
              Données collectées
            </h2>
            <p className="mb-3">
              Dans le cadre de la mesure d&apos;audience, nous collectons les données suivantes :
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-slate-400">
              <li>Pages visitées et interactions (clics sur les onglets, filtres, graphiques)</li>
              <li>Source de la visite (moteur de recherche, lien direct, réseau social)</li>
              <li>Type d&apos;appareil (mobile ou desktop) et taille d&apos;écran</li>
              <li>Langue du navigateur</li>
              <li>Pays et ville approximative (déduits de l&apos;adresse IP, qui est ensuite tronquée)</li>
              <li>Un identifiant anonyme stocké dans un cookie pour distinguer les visiteurs récurrents</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section>
            <h2 className="text-lg font-semibold text-slate-100 mb-3">
              Cookie de mesure d&apos;audience
            </h2>
            <p>
              Un cookie nommé <code className="bg-slate-800 px-1.5 py-0.5 rounded text-xs">_dl_vid</code> est
              déposé sur votre navigateur pour une durée maximale de <strong>13 mois</strong>.
              Il contient uniquement un identifiant aléatoire (UUID) qui ne permet pas de vous
              identifier personnellement. Ce cookie sert exclusivement à la mesure d&apos;audience.
            </p>
            <p className="mt-2">
              Conformément aux recommandations de la{' '}
              <a
                href="https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies-solutions-pour-les-outils-de-mesure-daudience"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                CNIL
              </a>
              , ce cookie bénéficie de l&apos;exemption de consentement car il est strictement
              limité à la mesure d&apos;audience, ne fait l&apos;objet d&apos;aucun recoupement
              avec d&apos;autres traitements, et ne permet pas le suivi de la navigation sur
              d&apos;autres sites.
            </p>
          </section>

          {/* Section 4 */}
          <section>
            <h2 className="text-lg font-semibold text-slate-100 mb-3">
              Hébergement des données
            </h2>
            <p>
              Les données sont stockées sur Google BigQuery dans la région <strong>EU</strong> (Union
              Européenne). Les adresses IP sont tronquées (dernier octet supprimé) avant stockage.
              Les données sont automatiquement supprimées après <strong>25 mois</strong>.
            </p>
          </section>

          {/* Section 5 */}
          <section>
            <h2 className="text-lg font-semibold text-slate-100 mb-3">
              Vos droits
            </h2>
            <p>
              Conformément au Règlement Général sur la Protection des Données (RGPD), vous disposez
              d&apos;un droit d&apos;accès, de rectification et de suppression de vos données. Vous
              pouvez également vous opposer à la mesure d&apos;audience en utilisant le bouton ci-dessous.
            </p>
            <p className="mt-2">
              Si votre navigateur envoie le signal{' '}
              <a
                href="https://globalprivacycontrol.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                Global Privacy Control (GPC)
              </a>
              , la mesure d&apos;audience est automatiquement désactivée.
            </p>
          </section>

          {/* Opt-out toggle */}
          <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  Mesure d&apos;audience
                </h3>
                <p className="text-slate-400 text-sm mt-1">
                  {isOptedOut
                    ? 'La mesure d\'audience est désactivée. Aucune donnée n\'est collectée.'
                    : 'La mesure d\'audience est activée. Vous pouvez la désactiver à tout moment.'}
                </p>
              </div>
              <button
                onClick={handleToggle}
                className={`
                  relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent
                  transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900
                  ${isOptedOut ? 'bg-slate-600' : 'bg-blue-600'}
                `}
                role="switch"
                aria-checked={!isOptedOut}
                aria-label="Activer ou désactiver la mesure d'audience"
              >
                <span
                  className={`
                    pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0
                    transition duration-200 ease-in-out
                    ${isOptedOut ? 'translate-x-0' : 'translate-x-5'}
                  `}
                />
              </button>
            </div>
          </section>

          {/* Contact */}
          <section className="text-xs text-slate-500 border-t border-slate-800 pt-6">
            <p>
              Pour toute question relative à la protection de vos données, vous pouvez
              consulter le site de la{' '}
              <a
                href="https://www.cnil.fr"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
              >
                CNIL
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
