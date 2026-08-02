"use client";

import { useState } from "react";
import {
  readContract,
  writeContract,
  readWithRetry,
  CONTRACT_ADDRESS,
  NETWORK_LABEL,
  explorerUrl,
  txExplorerUrl,
  type WriteResult,
} from "@/lib/genlayer";

// ── Types ──
interface WorkInfo {
  work_id: string;
  owner: string;
  work_url: string;
  work_desc: string;
  license_price: number;
  penalty_amount: number;
  infringement_count: number;
}

interface Verdict {
  verdict: string;
  similarity: number;
  reasoning: string;
  matched_elements: string;
  suspect_url: string;
}

interface WorkSummary {
  work_id: string;
  owner: string;
  work_url: string;
  license_price: number;
  penalty_amount: number;
  infringement_count: number;
  bounty_pool: number;
}

type Tab = "register" | "license" | "scan" | "view" | "browse";

function normaliseWorkId(raw: string): string {
  const trimmed = raw.trim();
  return /^\d+$/.test(trimmed) ? `work_${trimmed}` : trimmed;
}

// ── Verdict badge ──
function VerdictBadge({ verdict }: { verdict: string }) {
  const colors: Record<string, string> = {
    INFRINGEMENT: "bg-red-500/20 text-red-400 border-red-500/30",
    CLEAR: "bg-green-500/20 text-green-400 border-green-500/30",
    UNCERTAIN: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  };
  return (
    <span
      className={`inline-block px-3 py-1 rounded-full text-sm font-semibold border ${colors[verdict] || "bg-gray-500/20 text-gray-400 border-gray-500/30"}`}
    >
      {verdict}
    </span>
  );
}

// ── Similarity bar ──
function SimilarityBar({ score }: { score: number }) {
  const color =
    score >= 70
      ? "bg-red-500"
      : score >= 40
        ? "bg-yellow-500"
        : "bg-green-500";
  return (
    <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ${color}`}
        style={{ width: `${score}%` }}
      />
    </div>
  );
}

interface StatusMsg {
  type: "success" | "error" | "info" | "warn";
  msg: string;
  txHash?: string;
}

function statusClasses(type: StatusMsg["type"]): string {
  switch (type) {
    case "success":
      return "bg-green-500/10 border-green-500/30 text-green-400";
    case "error":
      return "bg-red-500/10 border-red-500/30 text-red-400";
    case "warn":
      return "bg-yellow-500/10 border-yellow-500/30 text-yellow-300";
    default:
      return "bg-blue-500/10 border-blue-500/30 text-blue-400";
  }
}

function describeWait(w: WriteResult["wait"]): string {
  if (w.timedOut)
    return `chain slow to confirm (last status: ${w.status}); reading state directly`;
  return `confirmed as ${w.status}`;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("register");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>("");
  const [status, setStatus] = useState<StatusMsg | null>(null);

  // Register form
  const [regUrl, setRegUrl] = useState("");
  const [regDesc, setRegDesc] = useState("");
  const [regPrice, setRegPrice] = useState("");
  const [regPenalty, setRegPenalty] = useState("");
  const [registeredId, setRegisteredId] = useState<string | null>(null);

  // License form
  const [licWorkId, setLicWorkId] = useState("");
  const [licValue, setLicValue] = useState("");

  // Scan form
  const [scanWorkId, setScanWorkId] = useState("");
  const [scanUrl, setScanUrl] = useState("");
  const [verdictResult, setVerdictResult] = useState<Verdict | null>(null);

  // View form
  const [viewWorkId, setViewWorkId] = useState("");
  const [workInfo, setWorkInfo] = useState<WorkInfo | null>(null);

  // Browse
  const [browseList, setBrowseList] = useState<WorkSummary[] | null>(null);

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "register", label: "Register Work", icon: "+" },
    { key: "license", label: "Purchase License", icon: "$" },
    { key: "scan", label: "Scan Infringement", icon: "?" },
    { key: "view", label: "View Work", icon: "i" },
    { key: "browse", label: "Browse Works", icon: "☰" },
  ];

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    setRegisteredId(null);
    setLoadingStep("Submitting registration…");
    try {
      const counterBeforeRaw = await readContract("get_work_counter", []);
      const counterBefore = Number(counterBeforeRaw);

      setLoadingStep("Waiting for consensus (Accepted)…");
      const { hash, wait } = await writeContract("register_work", [
        regUrl,
        regDesc,
        parseInt(regPrice),
        parseInt(regPenalty),
      ]);

      setLoadingStep("Reading on-chain state…");
      const counterAfterRaw = await readWithRetry(
        () => readContract("get_work_counter", []),
        (v) => Number(v) > counterBefore
      );
      const counterAfter = Number(counterAfterRaw);
      const newId = `work_${counterAfter - 1}`;

      setRegisteredId(newId);
      setStatus({
        type: wait.timedOut ? "warn" : "success",
        msg: `Work registered: ${newId} (${describeWait(wait)})`,
        txHash: hash,
      });
    } catch (err: unknown) {
      setStatus({
        type: "error",
        msg: `Registration failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  }

  async function handleLicense(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    setLoadingStep("Submitting license purchase…");
    try {
      const workId = normaliseWorkId(licWorkId);
      setLoadingStep("Waiting for consensus (Accepted)…");
      const { hash, wait } = await writeContract(
        "purchase_license",
        [workId],
        BigInt(licValue || "0")
      );
      setStatus({
        type: wait.timedOut ? "warn" : "success",
        msg: `License purchased for ${workId} (${describeWait(wait)})`,
        txHash: hash,
      });
    } catch (err: unknown) {
      setStatus({
        type: "error",
        msg: `License purchase failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  }

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    setVerdictResult(null);
    setLoadingStep("Submitting scan…");
    try {
      const workId = normaliseWorkId(scanWorkId);
      setLoadingStep("Fetching page + AI consensus (this can take a minute)…");
      const { hash, wait } = await writeContract("scan_for_infringement", [
        workId,
        scanUrl,
      ]);

      setLoadingStep("Reading verdict from chain…");
      const verdictRaw = await readWithRetry<unknown>(
        () => readContract("get_last_verdict_by_url", [workId, scanUrl]),
        (v) => {
          try {
            const s = typeof v === "string" ? v : JSON.stringify(v);
            return s.includes('"verdict"') && !s.includes('"error"');
          } catch {
            return false;
          }
        }
      );
      const parsed: Verdict =
        typeof verdictRaw === "string"
          ? JSON.parse(verdictRaw)
          : (verdictRaw as Verdict);
      setVerdictResult(parsed);
      setStatus({
        type: wait.timedOut
          ? "warn"
          : parsed.verdict === "INFRINGEMENT"
            ? "error"
            : parsed.verdict === "CLEAR"
              ? "success"
              : "info",
        msg: `Scan ${wait.timedOut ? "submitted" : "complete"}: ${parsed.verdict} (${parsed.similarity}% similarity) — ${describeWait(wait)}`,
        txHash: hash,
      });
    } catch (err: unknown) {
      setStatus({
        type: "error",
        msg: `Scan failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  }

  async function handleBrowse() {
    setLoading(true);
    setStatus(null);
    setBrowseList(null);
    try {
      const result = await readContract("list_works", []);
      const parsed = (
        typeof result === "string"
          ? JSON.parse(result)
          : (result as unknown)
      ) as { count: number; works: WorkSummary[] };
      setBrowseList(parsed.works);
      setStatus({
        type: "success",
        msg: `Loaded ${parsed.count} registered work(s)`,
      });
    } catch (err: unknown) {
      setStatus({
        type: "error",
        msg: `Failed to load list: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleView(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    setWorkInfo(null);
    try {
      const result = await readContract("get_work", [normaliseWorkId(viewWorkId)]);
      const parsed: WorkInfo =
        typeof result === "string"
          ? JSON.parse(result)
          : (result as unknown as WorkInfo);
      if ("error" in parsed) {
        setStatus({
          type: "error",
          msg: (parsed as unknown as { error: string }).error,
        });
      } else {
        setWorkInfo(parsed);
        setStatus({ type: "success", msg: `Loaded ${parsed.work_id}` });
      }
    } catch (err: unknown) {
      setStatus({
        type: "error",
        msg: `Failed to load: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-card-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center text-white font-bold text-lg">
              L
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">
                LicenseLogic
              </h1>
              <p className="text-xs text-muted">
                AI-Powered IP Licensing on GenLayer
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            <span className="hidden sm:inline">{NETWORK_LABEL}</span>
            <a
              href={explorerUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-card px-2 py-0.5 rounded text-[10px] border border-card-border hidden md:inline hover:text-accent"
            >
              {CONTRACT_ADDRESS?.slice(0, 6)}…{CONTRACT_ADDRESS?.slice(-4)}
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-card rounded-xl p-1 border border-card-border">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setActiveTab(t.key);
                setStatus(null);
              }}
              className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === t.key
                  ? "bg-accent text-white shadow-lg shadow-accent/20"
                  : "text-muted hover:text-foreground hover:bg-white/5"
              }`}
            >
              <span className="mr-1.5 font-mono">{t.icon}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Loading step banner */}
        {loading && loadingStep && (
          <div className="mb-3 px-4 py-2 rounded-lg border text-xs bg-blue-500/10 border-blue-500/30 text-blue-300 flex items-center gap-2">
            <span className="w-3 h-3 border-2 border-blue-300/40 border-t-blue-300 rounded-full animate-spin" />
            {loadingStep}
          </div>
        )}

        {/* Status */}
        {status && (
          <div
            className={`mb-6 px-4 py-3 rounded-lg border text-sm ${statusClasses(status.type)}`}
          >
            <div>{status.msg}</div>
            {status.txHash && (
              <div className="mt-1 text-xs">
                <a
                  href={txExplorerUrl(status.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline break-all opacity-80 hover:opacity-100"
                >
                  {status.txHash}
                </a>
              </div>
            )}
          </div>
        )}

        {/* Register */}
        {activeTab === "register" && (
          <div className="bg-card border border-card-border rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-1">Register Original Work</h2>
            <p className="text-muted text-sm mb-6">
              Register your IP on-chain with a reference URL and description of
              what constitutes infringement.
            </p>
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-sm text-muted mb-1.5">
                  Work URL
                </label>
                <input
                  type="url"
                  placeholder="https://example.com/my-article"
                  value={regUrl}
                  onChange={(e) => setRegUrl(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-muted mb-1.5">
                  Work Description &amp; Infringement Criteria
                </label>
                <textarea
                  rows={4}
                  placeholder="Describe the work and what would constitute infringement..."
                  value={regDesc}
                  onChange={(e) => setRegDesc(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-muted mb-1.5">
                    License Price (wei)
                  </label>
                  <input
                    type="number"
                    placeholder="1000"
                    value={regPrice}
                    onChange={(e) => setRegPrice(e.target.value)}
                    required
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm text-muted mb-1.5">
                    Penalty Amount (wei)
                  </label>
                  <input
                    type="number"
                    placeholder="5000"
                    value={regPenalty}
                    onChange={(e) => setRegPenalty(e.target.value)}
                    required
                    min="0"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-xl font-semibold transition-colors"
              >
                {loading ? "Registering..." : "Register Work"}
              </button>
            </form>
            {registeredId && (
              <div className="mt-4 p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
                <p className="text-sm text-green-400">
                  Work ID:{" "}
                  <code className="font-mono font-bold">{registeredId}</code>
                </p>
              </div>
            )}
          </div>
        )}

        {/* License */}
        {activeTab === "license" && (
          <div className="bg-card border border-card-border rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-1">Purchase License</h2>
            <p className="text-muted text-sm mb-6">
              Pay to license a registered work. You must send at least the
              listed license price.
            </p>
            <form onSubmit={handleLicense} className="space-y-4">
              <div>
                <label className="block text-sm text-muted mb-1.5">
                  Work ID
                </label>
                <input
                  type="text"
                  placeholder="work_0"
                  value={licWorkId}
                  onChange={(e) => setLicWorkId(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-muted mb-1.5">
                  Payment Amount (wei)
                </label>
                <input
                  type="number"
                  placeholder="1000"
                  value={licValue}
                  onChange={(e) => setLicValue(e.target.value)}
                  required
                  min="0"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-xl font-semibold transition-colors"
              >
                {loading ? "Processing..." : "Purchase License"}
              </button>
            </form>
          </div>
        )}

        {/* Scan */}
        {activeTab === "scan" && (
          <div className="bg-card border border-card-border rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-1">Scan for Infringement</h2>
            <p className="text-muted text-sm mb-6">
              Submit a suspect URL. The contract will fetch the page, analyze it
              with AI, and reach consensus on whether it infringes the registered
              work.
            </p>
            <form onSubmit={handleScan} className="space-y-4">
              <div>
                <label className="block text-sm text-muted mb-1.5">
                  Work ID
                </label>
                <input
                  type="text"
                  placeholder="work_0"
                  value={scanWorkId}
                  onChange={(e) => setScanWorkId(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-muted mb-1.5">
                  Suspect URL
                </label>
                <input
                  type="url"
                  placeholder="https://suspect-site.com/copied-article"
                  value={scanUrl}
                  onChange={(e) => setScanUrl(e.target.value)}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-xl font-semibold transition-colors"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Scanning &amp; Reaching Consensus...
                  </span>
                ) : (
                  "Scan URL"
                )}
              </button>
            </form>

            {verdictResult && (
              <div className="mt-6 p-5 bg-black/30 border border-card-border rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg">Verdict</h3>
                  <VerdictBadge verdict={verdictResult.verdict} />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-muted">Similarity</span>
                    <span className="font-mono font-bold">
                      {verdictResult.similarity}%
                    </span>
                  </div>
                  <SimilarityBar score={verdictResult.similarity} />
                </div>
                <div>
                  <p className="text-sm text-muted mb-1">Reasoning</p>
                  <p className="text-sm">{verdictResult.reasoning}</p>
                </div>
                <div>
                  <p className="text-sm text-muted mb-1">Matched Elements</p>
                  <p className="text-sm font-mono text-xs">
                    {verdictResult.matched_elements}
                  </p>
                </div>
                <div className="pt-2 border-t border-card-border">
                  <p className="text-xs text-muted break-all">
                    Scanned: {verdictResult.suspect_url}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* View */}
        {activeTab === "view" && (
          <div className="bg-card border border-card-border rounded-2xl p-6">
            <h2 className="text-xl font-bold mb-1">View Work Details</h2>
            <p className="text-muted text-sm mb-6">
              Look up a registered work by its ID.
            </p>
            <form onSubmit={handleView} className="space-y-4">
              <div>
                <label className="block text-sm text-muted mb-1.5">
                  Work ID
                </label>
                <input
                  type="text"
                  placeholder="work_0"
                  value={viewWorkId}
                  onChange={(e) => setViewWorkId(e.target.value)}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-xl font-semibold transition-colors"
              >
                {loading ? "Loading..." : "View Work"}
              </button>
            </form>

            {workInfo && (
              <div className="mt-6 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <InfoCard label="Work ID" value={workInfo.work_id} />
                  <InfoCard
                    label="Infringements"
                    value={String(workInfo.infringement_count)}
                    highlight={workInfo.infringement_count > 0}
                  />
                  <InfoCard
                    label="License Price"
                    value={`${workInfo.license_price} wei`}
                  />
                  <InfoCard
                    label="Penalty"
                    value={`${workInfo.penalty_amount} wei`}
                  />
                </div>
                <div className="p-3 bg-black/30 rounded-xl border border-card-border">
                  <p className="text-xs text-muted mb-1">Owner</p>
                  <p className="text-xs font-mono break-all">
                    {workInfo.owner}
                  </p>
                </div>
                <div className="p-3 bg-black/30 rounded-xl border border-card-border">
                  <p className="text-xs text-muted mb-1">Reference URL</p>
                  <a
                    href={workInfo.work_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-accent hover:text-accent-hover break-all"
                  >
                    {workInfo.work_url}
                  </a>
                </div>
                <div className="p-3 bg-black/30 rounded-xl border border-card-border">
                  <p className="text-xs text-muted mb-1">Description</p>
                  <p className="text-sm">{workInfo.work_desc}</p>
                </div>
              </div>
            )}
          </div>
        )}
        {/* Browse */}
        {activeTab === "browse" && (
          <div className="bg-card border border-card-border rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold mb-1">Browse Registered Works</h2>
                <p className="text-muted text-sm">
                  Snapshot of every work on this contract, pulled from the on-chain
                  <code className="mx-1">list_works</code> view.
                </p>
              </div>
              <button
                type="button"
                onClick={handleBrowse}
                disabled={loading}
                className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                {loading ? "Loading…" : browseList ? "Refresh" : "Load Works"}
              </button>
            </div>

            {browseList && browseList.length === 0 && (
              <p className="text-sm text-muted">No works registered yet.</p>
            )}

            {browseList && browseList.length > 0 && (
              <div className="space-y-3">
                {browseList.map((w) => (
                  <div
                    key={w.work_id}
                    className="p-4 bg-black/30 border border-card-border rounded-xl"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-sm font-bold">{w.work_id}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border ${
                          w.infringement_count > 0
                            ? "bg-red-500/10 border-red-500/30 text-red-400"
                            : "bg-green-500/10 border-green-500/30 text-green-400"
                        }`}
                      >
                        {w.infringement_count} infringement(s)
                      </span>
                    </div>
                    <a
                      href={w.work_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-accent break-all hover:text-accent-hover"
                    >
                      {w.work_url}
                    </a>
                    <div className="grid grid-cols-3 gap-3 mt-3 text-xs">
                      <div>
                        <p className="text-muted mb-0.5">License</p>
                        <p className="font-mono">{w.license_price} wei</p>
                      </div>
                      <div>
                        <p className="text-muted mb-0.5">Penalty</p>
                        <p className="font-mono">{w.penalty_amount} wei</p>
                      </div>
                      <div>
                        <p className="text-muted mb-0.5">Bounty pool</p>
                        <p className="font-mono">{w.bounty_pool} wei</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted mt-2 break-all font-mono">
                      Owner: {w.owner}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-card-border py-4 text-center text-xs text-muted">
        Built on{" "}
        <a
          href="https://genlayer.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:text-accent-hover"
        >
          GenLayer
        </a>{" "}
        — Intelligent Contracts with live web reading &amp; LLM consensus
      </footer>
    </div>
  );
}

function InfoCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="p-3 bg-black/30 rounded-xl border border-card-border">
      <p className="text-xs text-muted mb-0.5">{label}</p>
      <p
        className={`text-lg font-bold font-mono ${highlight ? "text-red-400" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}
