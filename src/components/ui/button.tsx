import { clsx } from "clsx";
import Link from "next/link";
import { ButtonHTMLAttributes, AnchorHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

interface BaseProps {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
}

type ButtonProps = BaseProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
type AnchorProps = BaseProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

type Props = ButtonProps | AnchorProps;

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-black font-medium hover:bg-accent-hover shadow-[0_0_20px_rgba(34,197,94,0.15)]",
  secondary:
    "bg-bg-card border border-border-primary text-text-primary hover:bg-bg-card-hover hover:border-border-hover",
  ghost:
    "border border-border-primary text-text-primary hover:bg-bg-card hover:border-border-hover",
};

const sizes = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-5 py-2.5 text-sm",
  lg: "px-6 py-3 text-base",
};

export function Button({ variant = "primary", size = "md", className, ...props }: Props) {
  const classes = clsx(
    "inline-flex items-center justify-center gap-2 rounded-lg transition-colors duration-200 cursor-pointer",
    variants[variant],
    sizes[size],
    className
  );

  if ("href" in props && props.href) {
    const { href, ...rest } = props as AnchorProps;
    const isExternal = href.startsWith("http") || href.startsWith("//");
    if (isExternal) {
      return <a href={href} className={classes} {...rest} />;
    }
    return <Link href={href} className={classes} {...rest} />;
  }

  return <button className={classes} {...(props as ButtonProps)} />;
}
