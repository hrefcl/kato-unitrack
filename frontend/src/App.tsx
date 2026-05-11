import { NavLink, Outlet } from "react-router-dom";
import { getLang, setLang, t, useLang, type Lang } from "./lib/i18n";

const TABS: Array<{ to: string; key: string }> = [
  { to: "/editor", key: "nav.editor" },
  { to: "/catalog", key: "nav.catalog" },
  { to: "/inventory", key: "nav.inventory" },
  { to: "/generator", key: "nav.generator" },
  { to: "/layouts", key: "nav.layouts" },
];

export function App() {
  // Subscribe to language changes so the whole tree re-renders on toggle.
  useLang();
  return (
    <div className="h-full flex flex-col">
      <header className="border-b border-zinc-800 px-4 py-2 flex items-center gap-6">
        <div className="flex items-baseline gap-2">
          <span className="text-amber-400 font-bold tracking-wider">KATO</span>
          <span className="text-zinc-400 text-sm">{t("app.tag")}</span>
        </div>
        <nav className="flex gap-1 ml-4">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              data-testid={`nav-${tab.to.slice(1)}`}
              className={({ isActive }) =>
                `px-3 py-1.5 text-sm border-b-2 ${
                  isActive ? "tab-active" : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`
              }
            >
              {t(tab.key)}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-1 text-xs text-zinc-500">
            <span aria-hidden="true">🌐</span>
            <span className="sr-only">{t("lang.toggle")}</span>
            <select
              value={getLang()}
              onChange={(e) => setLang(e.target.value as Lang)}
              data-testid="lang-toggle"
              className="bg-zinc-900 border border-zinc-700 rounded px-1 py-0.5 text-xs"
            >
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </label>
          <a
            href="https://github.com/hrefcl/kato-unitrack"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            github.com/hrefcl/kato-unitrack
          </a>
        </div>
      </header>
      <main className="flex-1 min-h-0">
        <Outlet />
      </main>
    </div>
  );
}
