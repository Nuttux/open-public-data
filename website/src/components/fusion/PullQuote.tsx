import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  cite?: ReactNode;
  className?: string;
};

export default function PullQuote({ children, cite, className }: Props) {
  return (
    <blockquote className={["fx-pull-quote", className ?? ""].filter(Boolean).join(" ")}>
      <p>{children}</p>
      {cite && <cite>{cite}</cite>}
    </blockquote>
  );
}
