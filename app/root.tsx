import { isRouteErrorResponse, Links, Meta, NavLink, Outlet, Scripts, ScrollRestoration, useLocation } from "react-router";
import type { Route } from "./+types/root";
import { offlineReading } from "./domain";
import { CurationOffline, ReaderOffline, useOnline, useServiceWorker } from "./offline";
import ledger from "./ledger.css?url";

export const links: Route.LinksFunction = () => [
  { rel: "stylesheet", href: ledger },
  // Installable app (vite.config.ts). Credentials so the manifest request passes Cloudflare Access.
  { rel: "manifest", href: "/manifest.webmanifest", crossOrigin: "use-credentials" },
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
];

const TABS = [
  ["/athletes", "Athlete"],
  ["/calendar", "Calendar"],
  ["/championship", "Championship"],
  ["/games", "Games"],
] as const;

export function Layout({ children }: { children: React.ReactNode }) {
  useServiceWorker();
  const online = useOnline();
  const { pathname } = useLocation();
  // Offline, a curation page never shows its (stale) forms.
  const page = !online && offlineReading(pathname) === "curation" ? <CurationOffline /> : children;
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#1c1c1c" />
        <Meta />
        <Links />
      </head>
      <body>
        <main className="wrap">{page}</main>
        <nav className="tabs" aria-label="Sections">
          {TABS.map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? "on" : undefined)}>
              {label}
            </NavLink>
          ))}
        </nav>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const online = useOnline();
  if (!online) return <ReaderOffline />;
  const title = isRouteErrorResponse(error) ? (error.status === 404 ? "Not found" : `Error ${error.status}`) : "Something went wrong";
  const detail = isRouteErrorResponse(error) ? error.statusText || error.data : import.meta.env.DEV && error instanceof Error ? error.message : null;
  return (
    <>
      <h1>{title}</h1>
      {detail ? <p className="meta">{String(detail)}</p> : null}
    </>
  );
}
