import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../store";
import { catalog } from "../catalog";
import { generateLayouts } from "@kato-unitrack/layout-generator";
import {
  PROVIDERS,
  materializeProposal,
  type AIProvider,
  type LayoutProposal,
} from "@kato-unitrack/ai-providers";
import { validate } from "@kato-unitrack/geometry-engine";
import { t, useLang } from "../lib/i18n";

// Persisted on the user's browser only. Each provider gets its own
// localStorage entry so a user can rotate keys without losing the
// others.
const KEY_PREFIX = "kato-unitrack:ai-key:";

function readKey(providerId: string): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(KEY_PREFIX + providerId) ?? "";
}

function writeKey(providerId: string, key: string): void {
  if (typeof localStorage === "undefined") return;
  if (key) localStorage.setItem(KEY_PREFIX + providerId, key);
  else localStorage.removeItem(KEY_PREFIX + providerId);
}

interface MaterializedProposal {
  proposal: LayoutProposal;
  placements: ReturnType<typeof materializeProposal> extends infer R
    ? R extends { ok: true; layout: { placements: infer P } } ? P : never
    : never;
}

export function GeneratorPage() {
  useLang();
  const navigate = useNavigate();
  const inv = useApp((s) => s.inventory);
  const scale = useApp((s) => s.workingLayout.scale);
  const board = useApp((s) => s.workingLayout.board_mm);
  const setBoard = useApp((s) => s.layoutSetBoard);
  const loadGen = useApp((s) => s.layoutLoadFromGenerator);

  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<ReturnType<typeof generateLayouts>>([]);

  // ── AI panel state ────────────────────────────────────────────────
  const providerIds = useMemo(() => [...PROVIDERS.keys()], []);
  const [providerId, setProviderId] = useState<string>("local-demo");
  const [apiKey, setApiKey] = useState<string>("");
  const [prompt, setPrompt] = useState<string>("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiProposals, setAiProposals] = useState<LayoutProposal[]>([]);

  // Pull the saved key for the active provider when the dropdown changes.
  useEffect(() => {
    setApiKey(readKey(providerId));
    setAiError(null);
  }, [providerId]);

  // Push the live API key into the provider instance. The stub providers
  // expose setApiKey() to receive it; LocalDemo ignores it.
  const provider: AIProvider | undefined = PROVIDERS.get(providerId);
  useEffect(() => {
    const p = provider as unknown as { setApiKey?: (k: string | null) => void } | undefined;
    if (p?.setApiKey) p.setApiKey(apiKey || null);
  }, [provider, apiKey]);

  const run = () => {
    setRunning(true);
    try {
      const r = generateLayouts({
        catalog,
        inventory: inv,
        board_mm: board,
        scale,
        preferences: { maxResults: 6 },
      });
      setResults(r);
    } finally {
      setRunning(false);
    }
  };

  const askAI = async () => {
    if (!provider) return;
    setAiBusy(true);
    setAiError(null);
    setAiProposals([]);
    try {
      // Project inventory into the plain {code: available} map the
      // provider interface consumes.
      const availableInventory: Record<string, number> = {};
      for (const e of Object.values(inv.entries)) {
        const avail = Math.max(0, e.owned - e.used);
        if (avail > 0) availableInventory[e.code] = avail;
      }
      const props = await provider.generateLayoutSuggestion({
        scale,
        boardMm: board,
        availableInventory,
        userIntent: prompt.trim() || undefined,
        maxProposals: 3,
      });
      if (props.length === 0) {
        setAiError(t("ai.noProposals"));
      } else {
        setAiProposals(props);
      }
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      // Friendlier message for known stubs.
      if (/network call not implemented/i.test(msg)) {
        setAiError(t("ai.providerNotReady"));
      } else if (/no API key/i.test(msg)) {
        setAiError(t("ai.keyMissing"));
      } else {
        setAiError(msg);
      }
    } finally {
      setAiBusy(false);
    }
  };

  const materializeAndOpen = (proposal: LayoutProposal) => {
    const r = materializeProposal(proposal, catalog);
    if (!r.ok) {
      setAiError(t("ai.materializeFailed", { reason: r.reason }));
      return;
    }
    const geom = catalog.geometryMap();
    const v = validate(r.layout, geom);
    if (!v.ok) {
      setAiError(t("ai.materializeFailed", { reason: v.errors.join("; ") }));
      return;
    }
    loadGen(
      [...r.layout.placements],
      [...r.layout.attachments],
      { ...board },
      proposal.name || "AI suggestion",
      `ai:${provider?.id ?? "?"}`,
    );
    navigate("/editor");
  };

  const hasAnyTrack = useMemo(
    () => Object.values(inv.entries).some((e) => e.owned - e.used > 0),
    [inv],
  );

  return (
    <div className="h-full overflow-auto p-4 space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
        <div className="text-sm text-zinc-400">{t("generator.intro")}</div>
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <label className="text-xs text-zinc-500 flex items-center gap-1">
            {t("editor.board")}
            <input
              className="input w-24"
              type="number"
              value={board.width}
              onChange={(e) => setBoard({ width: Number(e.target.value), height: board.height })}
            />
            ×
            <input
              className="input w-24"
              type="number"
              value={board.height}
              onChange={(e) => setBoard({ width: board.width, height: Number(e.target.value) })}
            />
          </label>
          <button className="btn btn-primary" disabled={running || !hasAnyTrack} onClick={run}>
            {running ? t("generator.running") : t("generator.run")}
          </button>
          {!hasAnyTrack && <span className="text-rose-400 text-xs">{t("generator.emptyInv")}</span>}
        </div>
      </div>

      {results.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {results.map((r, i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded p-3">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <div className="text-amber-400 text-sm font-medium">{r.layout.name}</div>
                  <div className="text-[11px] text-zinc-500">
                    {t("generator.strategy")}: {r.layout.strategy}
                  </div>
                </div>
                <button
                  className="btn btn-primary text-xs"
                  onClick={() => {
                    loadGen(
                      r.layout.placements as never,
                      r.layout.attachments as never,
                      r.layout.board_mm,
                      r.layout.name,
                      r.layout.strategy,
                    );
                    navigate("/editor");
                  }}
                >
                  {t("generator.openInEditor")}
                </button>
              </div>
              <div className="text-xs text-zinc-300 mt-2">{r.layout.notes}</div>
              <div className="text-[11px] text-zinc-500 mt-2">
                {t("generator.piecesUsed")}:{" "}
                {Object.entries(r.layout.inventory_usage)
                  .map(([k, v]) => `${k}×${v}`)
                  .join(", ")}
              </div>
              {r.warnings.length > 0 && (
                <div className="text-[11px] text-amber-300 mt-2">
                  {r.warnings.length} {t("generator.warnings")}:{" "}
                  {r.warnings.slice(0, 3).join("; ")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── AI generation panel ───────────────────────────────────── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded p-3" data-testid="ai-panel">
        <div className="flex items-center gap-2 mb-2">
          <span aria-hidden="true">🤖</span>
          <h3 className="text-sm font-medium text-amber-400">{t("ai.title")}</h3>
        </div>
        <p className="text-xs text-zinc-400 mb-3">{t("ai.body")}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <label className="text-xs text-zinc-500 flex flex-col gap-1">
            {t("ai.provider")}
            <select
              className="input"
              value={providerId}
              onChange={(e) => setProviderId(e.target.value)}
              data-testid="ai-provider"
            >
              {providerIds.map((id) => (
                <option key={id} value={id}>
                  {id === "local-demo" ? t("ai.localDemo") : (PROVIDERS.get(id)?.displayName ?? id)}
                </option>
              ))}
            </select>
          </label>
          {providerId !== "local-demo" && (
            <label className="text-xs text-zinc-500 flex flex-col gap-1">
              {t("ai.apiKey")}
              <input
                type="password"
                className="input"
                placeholder={t("ai.apiKeyPlaceholder")}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onBlur={() => writeKey(providerId, apiKey)}
                data-testid="ai-api-key"
              />
            </label>
          )}
        </div>
        <label className="text-xs text-zinc-500 flex flex-col gap-1 mb-3">
          {t("ai.prompt")}
          <textarea
            className="input min-h-[60px]"
            placeholder={t("ai.promptPlaceholder")}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            data-testid="ai-prompt"
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            className="btn btn-primary text-xs"
            disabled={aiBusy || !hasAnyTrack}
            onClick={askAI}
            data-testid="ai-suggest"
          >
            {aiBusy ? t("ai.suggesting") : t("ai.suggest")}
          </button>
          {aiError && (
            <span className="text-rose-300 text-xs flex-1">{aiError}</span>
          )}
        </div>

        {aiProposals.length > 0 && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {aiProposals.map((p, i) => (
              <div key={i} className="bg-zinc-950 border border-zinc-800 rounded p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-amber-400 text-sm font-medium">{p.name}</div>
                  <button
                    className="btn btn-primary text-xs"
                    onClick={() => materializeAndOpen(p)}
                    data-testid="ai-materialize"
                  >
                    {t("ai.materialize")}
                  </button>
                </div>
                <div className="text-xs text-zinc-300 mt-2">{p.rationale}</div>
                <div className="text-[11px] text-zinc-500 mt-2">
                  {p.moves.length} moves
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {results.length === 0 && aiProposals.length === 0 && (
        <div className="text-zinc-500 text-sm">{t("generator.noResults")}</div>
      )}
    </div>
  );
}
