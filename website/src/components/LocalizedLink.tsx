"use client";

import NextLink from "next/link";
import type { ComponentProps } from "react";
import { forwardRef } from "react";
import { useLang } from "@/lib/navigation";
import { localize } from "@/lib/urls";

/**
 * next/link that writes the reader's language into internal addresses.
 *
 * Code links to LOGICAL paths (lib/urls.ts): `/france/paris/budget`, `/methode`.
 * This component renders `/fr/france/paris/budget` for a French reader and
 * `/en/france/paris/budget` for an English one. Full addresses, external
 * links and hashes pass through untouched. Same props as next/link.
 */
type Props = ComponentProps<typeof NextLink>;

const LocalizedLink = forwardRef<HTMLAnchorElement, Props>(function LocalizedLink({ href, ...rest }, ref) {
  const lang = useLang();
  const localized =
    typeof href === "string"
      ? localize(href, lang)
      : href && typeof href === "object" && typeof href.pathname === "string"
        ? { ...href, pathname: localize(href.pathname, lang) }
        : href;
  return <NextLink ref={ref} href={localized} {...rest} />;
});

export default LocalizedLink;
