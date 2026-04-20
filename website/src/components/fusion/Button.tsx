import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary";

type BaseProps = {
  variant?: Variant;
  className?: string;
  children: ReactNode;
};

type AsLink = BaseProps & { href: string } & Omit<ComponentProps<typeof Link>, "href" | "children" | "className">;
type AsButton = BaseProps & { href?: undefined } & Omit<ComponentProps<"button">, "className" | "children">;

type Props = AsLink | AsButton;

export default function Button(props: Props) {
  const { variant = "secondary", className, children } = props;
  const cls = [
    "fx-btn",
    variant === "primary" ? "fx-btn-primary" : "",
    className ?? "",
  ].filter(Boolean).join(" ");

  if ("href" in props && props.href) {
    const { variant: _v, className: _c, children: _ch, href, ...rest } = props;
    void _v; void _c; void _ch;
    return (
      <Link href={href} className={cls} {...rest}>
        {children}
      </Link>
    );
  }
  const { variant: _v, className: _c, children: _ch, href: _h, ...rest } = props as AsButton;
  void _v; void _c; void _ch; void _h;
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}
