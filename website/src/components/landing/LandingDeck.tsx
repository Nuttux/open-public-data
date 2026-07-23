import Link from "next/link";
import type { DeckCard } from "./types";

/**
 * Hero deck — the row of big photo cards under the headline. Each card is a
 * fully-resolved DeckCard (kicker/title/number/meta/cta + optional photo).
 * When `photo` is null the card renders without the figure (non-photo variant).
 */
function Card({ card }: { card: DeckCard }) {
  const cls = card.photo
    ? "fx-hero-deck-card fx-hero-deck-card-photo"
    : "fx-hero-deck-card";
  return (
    <Link className={cls} href={card.href} scroll={card.scroll ?? true}>
      {card.photo && (
        <figure className="fx-hero-deck-photo">
          <img
            src={card.photo}
            alt={card.photoAlt ?? ""}
            loading="eager"
            fetchPriority="high"
            width={1200}
            height={675}
          />
          {card.photoCredit && (
            <figcaption className="fx-hero-deck-photo-credit">
              © {card.photoCredit}
            </figcaption>
          )}
        </figure>
      )}
      <div className="fx-hero-deck-body">
        <span className="fx-hero-deck-kicker">{card.kicker}</span>
        <h3 className="fx-hero-deck-title">{card.title}</h3>
        <p className="fx-hero-deck-num tnum">
          {card.amountLead && <span className="u u-lead">{card.amountLead}</span>}
          {card.amount}
          {card.amountUnit && <span className="u">{card.amountUnit}</span>}
        </p>
        <p className="fx-hero-deck-meta">{card.meta}</p>
        <p className="fx-hero-deck-cta">
          {card.cta} <span aria-hidden="true">→</span>
        </p>
      </div>
    </Link>
  );
}

export default function LandingDeck({
  cards,
  ariaLabel,
}: {
  cards: DeckCard[];
  ariaLabel?: string;
}) {
  return (
    <section className="fx-hero-deck" id="hero-deck" aria-label={ariaLabel}>
      <div className="fx-wrap">
        <div className="fx-hero-deck-rail" role="group">
          {cards.map((c) => (
            <Card key={c.href} card={c} />
          ))}
        </div>
      </div>
    </section>
  );
}
