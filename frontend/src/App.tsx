import { NavLink, Outlet } from "react-router-dom";

const TABS = [
  { to: "/editor", label: "Editor" },
  { to: "/catalog", label: "Catálogo" },
  { to: "/inventory", label: "Inventario" },
  { to: "/generator", label: "Generador" },
  { to: "/layouts", label: "Layouts" },
];

export function App() {
  return (
    <div className="h-full flex flex-col">
      <header className="border-b border-zinc-800 px-4 py-2 flex items-center gap-6">
        <div className="flex items-baseline gap-2">
          <span className="text-amber-400 font-bold tracking-wider">KATO</span>
          <span className="text-zinc-400 text-sm">UNITRACK Layout Designer</span>
        </div>
        <nav className="flex gap-1 ml-4">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                `px-3 py-1.5 text-sm border-b-2 ${
                  isActive ? "tab-active" : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
        <a
          href="https://github.com/hrefcl/kato-unitrack"
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-xs text-zinc-500 hover:text-zinc-300"
        >
          github.com/hrefcl/kato-unitrack
        </a>
      </header>
      <main className="flex-1 min-h-0">
        <Outlet />
      </main>
    </div>
  );
}
