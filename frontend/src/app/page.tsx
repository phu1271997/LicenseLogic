"use client";

import { useState } from "react";
import { readContract, writeContract, CONTRACT_ADDRESS } from "@/lib/genlayer";

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

type Tab = "register" | "license" | "scan" | "view";

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

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("register");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error" | "info";
    msg: string;
  } | null>(null);

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

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "register", label: "Register Work", icon: "+" },
    { key: "license", label: "Purchase License", icon: "$" },
    { key: "scan", label: "Scan Infringement", icon: "?" },
    { key: "view", label: "View Work", icon: "i" },
  ];

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    setRegisteredId(null);
    try {
      const { receipt } = await writeContract("register_work", [
        regUrl,
        regDesc,
        parseInt(regPrice),
        parseInt(regPenalty),
      ]);
      const result =
        (receipt as unknown as { result: string })?.result || "work_0";
      setRegisteredId(result);
      setStatus({ type: "success", msg: `Work registered: ${result}` });
    } catch (err: unknown) {
      setStatus({
        type: "error",
        msg: `Registration failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleLicense(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      await writeContract(
        "purchase_license",
        [licWorkId],
        BigInt(licValue || "0")
      );
      setStatus({ type: "success", msg: "License purchased successfully!" });
    } catch (err: unknown) {
      setStatus({
        type: "error",
        msg: `License purchase failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    setVerdictResult(null);
    try {
      const { receipt } = await writeContract("scan_for_infringement", [
        scanWorkId,
        scanUrl,
      ]);
      const raw =
        (receipt as unknown as { result: string })?.result || "{}";
      const parsed: Verdict =
        typeof raw === "string" ? JSON.parse(raw) : (raw as Verdict);
      setVerdictResult(parsed);
      setStatus({
        type:
          parsed.verdict === "INFRINGEMENT"
            ? "error"
            : parsed.verdict === "CLEAR"
              ? "success"
              : "info",
        msg: `Scan complete: ${parsed.verdict} (${parsed.similarity}% similarity)`,
      });
    } catch (err: unknown) {
      setStatus({
        type: "error",
        msg: `Scan failed: ${err instanceof Error ? err.message : String(err)}`,
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
      const result = await readContract("get_work", [viewWorkId]);
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
            <span className="hidden sm:inline">Studio</span>
            <code className="bg-card px-2 py-0.5 rounded text-[10px] border border-card-border hidden md:inline">
              {CONTRACT_ADDRESS?.slice(0, 6)}...{CONTRACT_ADDRESS?.slice(-4)}
            </code>
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

        {/* Status */}
        {status && (
          <div
            className={`mb-6 px-4 py-3 rounded-lg border text-sm ${
              status.type === "success"
                ? "bg-green-500/10 border-green-500/30 text-green-400"
                : status.type === "error"
                  ? "bg-red-500/10 border-red-500/30 text-red-400"
                  : "bg-blue-500/10 border-blue-500/30 text-blue-400"
            }`}
          >
            {status.msg}
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
