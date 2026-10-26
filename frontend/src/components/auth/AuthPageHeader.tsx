import { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

type Props = { children?: ReactNode };

export const AuthPageHeader = ({ children }: Props) => (
  <header className="relative z-10 flex h-16 w-full shrink-0 items-center justify-between px-5 sm:px-8 lg:px-10 xl:px-14">
    <Link to="/" aria-label="Keydesk 홈">
      <img alt="Keydesk" src="/images/keydesk-wordmark.svg" className="h-7" />
    </Link>
    {children && <div className="flex items-center gap-2">{children}</div>}
  </header>
);
