import { isRouteErrorResponse, Links, Meta, NavLink, Outlet, Scripts, ScrollRestoration } from "react-router";
import type { Route } from "./+types/root";
import ledger from "./ledger.css?url";

export const links: Route.LinksFunction = () => [{ rel: "stylesheet", href: ledger }];

const TABS = [
  ["/athletes", "Athlete"],
  ["/calendar", "Calendar"],
  ["/championship", "Championship"],
  ["/games", "Games"],
] as const;

export function Layout({ children }: { children: React.ReactNode }) {
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
        <main className="wrap">{children}</main>
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
  const title = isRouteErrorResponse(error) ? (error.status === 404 ? "Not found" : `Error ${error.status}`) : "Something went wrong";
  const detail = isRouteErrorResponse(error) ? error.statusText || error.data : import.meta.env.DEV && error instanceof Error ? error.message : null;
  return (
    <>
      <h1>{title}</h1>
      {detail ? <p className="meta">{String(detail)}</p> : null}
    </>
  );
}
