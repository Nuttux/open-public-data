import type { LandingModel } from "./types";
import LandingHero from "./LandingHero";
import LandingDeck from "./LandingDeck";
import LandingMarquee from "./LandingMarquee";
import LandingScale from "./LandingScale";
import LandingChips from "./LandingChips";

/**
 * Generic landing template. A city builds a LandingModel from its own data and
 * hands it here; this composes the acts in a fixed order using the shared
 * `.theme-fusion .fx-*` styling. It renders only the <main> content — the
 * theme wrapper and chrome (navbar/footer) are the page/layout's job, since
 * Paris and /us provide chrome differently.
 *
 * Fold = hero + deck + marquee (first viewport). Below the fold: the scale act
 * and the section chips, then any city-specific tail acts via `extras`.
 */
export default function Landing({ model }: { model: LandingModel }) {
  return (
    <main id="main-content" tabIndex={-1}>
      <div className="fx-hero-fold">
        <LandingHero hero={model.hero} />
        {model.deck && model.deck.length > 0 && (
          <LandingDeck cards={model.deck} ariaLabel={model.deckAriaLabel} />
        )}
        {model.marquee && model.marquee.length > 0 && (
          <LandingMarquee items={model.marquee} ariaLabel={model.marqueeAriaLabel} />
        )}
      </div>

      {model.scale && <LandingScale scale={model.scale} />}
      {model.chips && <LandingChips {...model.chips} />}
      {model.extras}
    </main>
  );
}
