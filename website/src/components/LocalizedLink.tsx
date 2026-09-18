"use client";

import NextLink from "next/link";
import type { ComponentProps } from "react";
import { forwardRef, useState } from "react";
import { useLang } from "@/lib/navigation";
import { localize } from "@/lib/urls";

/**
 * next/link that writes the reader's language into internal addresses.
 *
 * Code links to LOGICAL paths (lib/urls.ts): `/france/paris/budget`, `/methode`.
 * This component renders `/fr/france/paris/budget` for a French reader and
 * `/en/france/paris/budget` for an English one. Full addresses, external
 * links and hashes pass through untouched. Same props as next/link.
 *
 * Prefetch waits for intent. next/link prefetches every link that enters the
 * viewport, and our pages are lists of hundreds of links: measured in production
 * on 2026-09-18, one page opened by a JavaScript-running crawler fired about
 * 100 prefetch requests, each one a proxy invocation plus a page function, and
 * none of them a CDN hit (the cache key of a prefetch varies with the page it
 * comes from). So a link prefetches once the reader points at it, focuses it or
 * touches it, which still lands before the click. The `<a href>` in the HTML is
 * unchanged, so nothing changes for search engines. A caller that passes
 * `prefetch` itself keeps what it asked for.
 */
type Props = ComponentProps<typeof NextLink>;

const LocalizedLink = forwardRef<HTMLAnchorElement, Props>(function LocalizedLink(
  { href, prefetch, onMouseEnter, onFocus, onTouchStart, ...rest },
  ref,
) {
  const lang = useLang();
  const [intent, setIntent] = useState(false);
  const localized =
    typeof href === "string"
      ? localize(href, lang)
      : href && typeof href === "object" && typeof href.pathname === "string"
        ? { ...href, pathname: localize(href.pathname, lang) }
        : href;
  return (
    <NextLink
      ref={ref}
      href={localized}
      prefetch={prefetch !== undefined ? prefetch : intent ? null : false}
      onMouseEnter={(e) => {
        setIntent(true);
        onMouseEnter?.(e);
      }}
      onFocus={(e) => {
        setIntent(true);
        onFocus?.(e);
      }}
      onTouchStart={(e) => {
        setIntent(true);
        onTouchStart?.(e);
      }}
      {...rest}
    />
  );
});

export default LocalizedLink;
