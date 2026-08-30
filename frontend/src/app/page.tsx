"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  readContract,
  writeContract,
  readWithRetry,
  CONTRACT_ADDRESS,
  NETWORK_LABEL,
  BURNER_ADDRESS,
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
  bounty_pool?: number;
  anchored?: boolean;
  anchor_summary?: string;
  scans_disabled?: boolean;
}

interface Perspectives {
  legal?: string;
  forensic?: string;
  skeptic?: string;
}

interface Verdict {
  verdict: string;
  similarity: number;
  reasoning: string;
  matched_elements: string;
  suspect_url: string;
  canonical_url?: string;
  already_credited?: boolean;
  registered_url_shortcut?: boolean;
  fetch_failed?: boolean;
  injection_attempt?: boolean;
  perspectives?: Perspectives;
}

interface AppealView {
  verdict_key: string;
  state: string; // "none" | "pending" | "overturned" | "upheld"
  stake: number;
  appellant: string;
  scanner: string;
  resolution_reason: string;
}

interface Reputation {
  address: string;
  honest_scans: number;
  overturned_scans: number;
  tier: string; // bronze | silver | gold
  bounty_share_pct: number;
}

interface WorkSummary {
  work_id: string;
  owner: string;
  work_url: string;
  license_price: number;
  penalty_amount: number;
  infringement_count: number;
  bounty_pool: number;
  anchored?: boolean;
}

type Tab = "register" | "license" | "scan" | "view" | "browse";

function normaliseWorkId(raw: string): string {
  const trimmed = raw.trim();
  return /^\d+$/.test(trimmed) ? `work_${trimmed}` : trimmed;
}

// ── Verdict badge ──
function VerdictBadge({ verdict }: { verdict: string }) {
  const colors: Record<string, string> = {
    INFRINGEMENT: "bg-red-500/15 text-red-300 border-red-500/30",
    CLEAR: "bg-green-500/15 text-green-300 border-green-500/30",
    UNCERTAIN: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border tracking-wide ${colors[verdict] || "bg-gray-500/15 text-gray-300 border-gray-500/30"}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {verdict}
    </span>
  );
}

// ── Similarity bar ──
function SimilarityBar({ score }: { score: number }) {
  const color =
    score >= 70 ? "from-red-500 to-rose-400" : score >= 40 ? "from-amber-500 to-yellow-400" : "from-emerald-500 to-green-400";
  return (
    <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
      <div
        className={`h-full rounded-full bg-gradient-to-r ${color} transition-all duration-700`}
        style={{ width: `${Math.max(2, Math.min(100, score))}%` }}
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
      return "bg-green-500/10 border-green-500/30 text-green-300";
    case "error":
      return "bg-red-500/10 border-red-500/30 text-red-300";
    case "warn":
      return "bg-yellow-500/10 border-yellow-500/30 text-yellow-200";
    default:
      return "bg-blue-500/10 border-blue-500/30 text-blue-300";
  }
}

function describeWait(w: WriteResult["wait"]): string {
  if (w.timedOut) return `chain slow to confirm (last: ${w.status}); reading state directly`;
  return `confirmed ${w.status}`;
}

function shortAddr(addr: string, head = 6, tail = 4): string {
  if (!addr) return "";
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

// ─────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#app", label: "Try the app" },
  { href: "#verdicts", label: "Verdicts" },
  { href: "#architecture", label: "Architecture" },
  { href: "#compare", label: "vs Solidity" },
  { href: "#faq", label: "FAQ" },
];

// ─────────────────────────────────────────────────────────────

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("browse");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>("");
  const [status, setStatus] = useState<StatusMsg | null>(null);

  // Register form
  const [regUrl, setRegUrl] = useState("");
  const [regDesc, setRegDesc] = useState("");
  const [regPrice, setRegPrice] = useState("1000");
  const [regPenalty, setRegPenalty] = useState("5000");
  const [registeredId, setRegisteredId] = useState<string | null>(null);

  // License form
  const [licWorkId, setLicWorkId] = useState("");
  const [licValue, setLicValue] = useState("1000");

  // Scan form
  const [scanWorkId, setScanWorkId] = useState("");
  const [scanUrl, setScanUrl] = useState("");
  const [verdictResult, setVerdictResult] = useState<Verdict | null>(null);

  // View form
  const [viewWorkId, setViewWorkId] = useState("");
  const [workInfo, setWorkInfo] = useState<WorkInfo | null>(null);

  // Browse + live stats
  const [browseList, setBrowseList] = useState<WorkSummary[] | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  // v6 — admin pause status (silent if the view isn't on the deployed contract)
  const [contractPaused, setContractPaused] = useState<boolean | null>(null);
  // v7 — appeal state for the currently-displayed verdict (if any)
  const [appealView, setAppealView] = useState<AppealView | null>(null);
  const [requiredStake, setRequiredStake] = useState<number | null>(null);
  const [appealStake, setAppealStake] = useState<string>("");
  // v7 — burner's scanner reputation, shown in the nav
  const [myRep, setMyRep] = useState<Reputation | null>(null);

  const stats = useMemo(() => {
    const list = browseList || [];
    const anchored = list.filter((w) => w.anchored).length;
    const infringements = list.reduce((n, w) => n + (w.infringement_count || 0), 0);
    const bountyTotal = list.reduce((n, w) => n + (w.bounty_pool || 0), 0);
    return {
      works: list.length,
      anchored,
      infringements,
      bountyTotal,
    };
  }, [browseList]);

  const tabs: { key: Tab; label: string; icon: string }[] = useMemo(
    () => [
      { key: "browse", label: "Browse Works", icon: "☰" },
      { key: "view", label: "View Work", icon: "i" },
      { key: "scan", label: "Scan Infringement", icon: "?" },
      { key: "register", label: "Register Work", icon: "+" },
      { key: "license", label: "Purchase License", icon: "$" },
    ],
    []
  );

  const handleBrowse = useCallback(async () => {
    setLoading(true);
    setStatus(null);
    setBrowseList(null);
    try {
      const result = await readContract("list_works", []);
      const parsed = (typeof result === "string" ? JSON.parse(result) : (result as unknown)) as {
        count: number;
        works: WorkSummary[];
      };
      setBrowseList(parsed.works);
      setStatus({ type: "success", msg: `Loaded ${parsed.count} registered work(s)` });
    } catch (err: unknown) {
      setStatus({
        type: "error",
        msg: `Failed to load list: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // Live-load stats on mount (silent, no status message)
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const result = await readContract("list_works", []);
        const parsed = (typeof result === "string" ? JSON.parse(result) : (result as unknown)) as {
          count: number;
          works: WorkSummary[];
        };
        if (!cancel) setBrowseList(parsed.works);
      } catch {
        // ignore — stats block will show — signs
      } finally {
        if (!cancel) setStatsLoading(false);
      }

      // v6 — probe is_paused. Old contracts don't expose it; treat any
      // error as "not paused" and hide the banner.
      try {
        const p = await readContract("is_paused", []);
        if (!cancel) setContractPaused(Boolean(p));
      } catch {
        if (!cancel) setContractPaused(null);
      }

      // v7 — burner reputation. Silent fallback on old contracts.
      try {
        const raw = await readContract("get_scanner_reputation", [BURNER_ADDRESS]);
        const parsed: Reputation =
          typeof raw === "string" ? JSON.parse(raw) : (raw as unknown as Reputation);
        if (!cancel) setMyRep(parsed);
      } catch {
        if (!cancel) setMyRep(null);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

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

  const refreshAppealAndRep = useCallback(
    async (workId: string, url: string) => {
      try {
        const raw = await readContract("get_appeal", [workId, url]);
        const parsed: AppealView =
          typeof raw === "string" ? JSON.parse(raw) : (raw as unknown as AppealView);
        setAppealView(parsed);
      } catch {
        setAppealView(null);
      }
      try {
        const raw = await readContract("get_appeal_required_stake", [workId]);
        setRequiredStake(Number(raw));
      } catch {
        setRequiredStake(null);
      }
      try {
        const raw = await readContract("get_scanner_reputation", [BURNER_ADDRESS]);
        const parsed: Reputation =
          typeof raw === "string" ? JSON.parse(raw) : (raw as unknown as Reputation);
        setMyRep(parsed);
      } catch {
        // ignore
      }
    },
    []
  );

  async function handleFileAppeal(workId: string, url: string) {
    setLoading(true);
    setStatus(null);
    setLoadingStep("Filing appeal + staking…");
    try {
      const stakeWei = BigInt(appealStake || String(requiredStake || 0));
      const { hash, wait } = await writeContract(
        "file_appeal",
        [workId, url],
        stakeWei
      );
      await refreshAppealAndRep(workId, url);
      setStatus({
        type: wait.timedOut ? "warn" : "success",
        msg: `Appeal filed for ${workId} (${describeWait(wait)})`,
        txHash: hash,
      });
    } catch (err: unknown) {
      setStatus({
        type: "error",
        msg: `Appeal failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  }

  async function handleResolveAppeal(workId: string, url: string) {
    setLoading(true);
    setStatus(null);
    setLoadingStep("Re-scanning + reaching consensus on appeal (can take a minute)…");
    try {
      const { hash, wait } = await writeContract("resolve_appeal", [workId, url]);
      await refreshAppealAndRep(workId, url);
      setStatus({
        type: wait.timedOut ? "warn" : "success",
        msg: `Appeal resolved for ${workId} (${describeWait(wait)})`,
        txHash: hash,
      });
    } catch (err: unknown) {
      setStatus({
        type: "error",
        msg: `Resolve failed: ${err instanceof Error ? err.message : String(err)}`,
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
    setAppealView(null);
    setLoadingStep("Submitting scan…");
    try {
      const workId = normaliseWorkId(scanWorkId);
      setLoadingStep("Fetching page + AI consensus (this can take a minute)…");
      const { hash, wait } = await writeContract("scan_for_infringement", [workId, scanUrl]);

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
        typeof verdictRaw === "string" ? JSON.parse(verdictRaw) : (verdictRaw as Verdict);
      setVerdictResult(parsed);
      // v7 — after scan lands, load the appeal view so the panel can offer
      // "Appeal" or "Resolve" buttons where applicable. Silent on old contract.
      await refreshAppealAndRep(workId, scanUrl);
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
      const raw = err instanceof Error ? err.message : String(err);
      const hint = raw.includes("no anchored original")
        ? " — open the View tab and click 'Anchor Work' first."
        : "";
      setStatus({ type: "error", msg: `Scan failed: ${raw}${hint}` });
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  }

  async function handleAnchor(workId: string) {
    setLoading(true);
    setStatus(null);
    setLoadingStep("Anchoring: fetch + LLM consensus (this can take a minute)…");
    try {
      const { hash, wait } = await writeContract("anchor_work", [workId]);
      setLoadingStep("Reading anchor…");
      const refreshed = await readWithRetry<unknown>(
        () => readContract("get_work", [workId]),
        (v) => {
          try {
            const parsed = typeof v === "string" ? JSON.parse(v) : (v as WorkInfo);
            return Boolean(parsed?.anchored);
          } catch {
            return false;
          }
        }
      );
      const parsed: WorkInfo =
        typeof refreshed === "string" ? JSON.parse(refreshed) : (refreshed as WorkInfo);
      setWorkInfo(parsed);
      setStatus({
        type: wait.timedOut ? "warn" : "success",
        msg: `Work anchored (${describeWait(wait)})`,
        txHash: hash,
      });
    } catch (err: unknown) {
      setStatus({
        type: "error",
        msg: `Anchor failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  }

  async function handleView(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    setWorkInfo(null);
    try {
      const workId = normaliseWorkId(viewWorkId);
      const result = await readContract("get_work", [workId]);
      const parsed: WorkInfo =
        typeof result === "string" ? JSON.parse(result) : (result as unknown as WorkInfo);
      if ("error" in parsed) {
        setStatus({
          type: "error",
          msg: (parsed as unknown as { error: string }).error,
        });
      } else {
        // v6 — enrich with scans_disabled if the view exists. Silent fallback
        // to false on old contracts that don't expose the view.
        try {
          const disabled = await readContract("get_scans_disabled", [workId]);
          parsed.scans_disabled = Boolean(disabled);
        } catch {
          parsed.scans_disabled = false;
        }
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

  async function handleToggleScans(workId: string, next: boolean) {
    setLoading(true);
    setStatus(null);
    setLoadingStep(next ? "Disabling scans…" : "Re-enabling scans…");
    try {
      const { hash, wait } = await writeContract("set_scans_disabled", [
        workId,
        next,
      ]);
      // Refresh the work — scans_disabled will reflect the new state.
      setWorkInfo((prev) => (prev ? { ...prev, scans_disabled: next } : prev));
      setStatus({
        type: wait.timedOut ? "warn" : "success",
        msg: `Scans ${next ? "disabled" : "re-enabled"} for ${workId} (${describeWait(wait)})`,
        txHash: hash,
      });
    } catch (err: unknown) {
      setStatus({
        type: "error",
        msg: `Toggle failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  }

  const usePrefilled = (workId: string, url?: string) => {
    setActiveTab("scan");
    setScanWorkId(workId);
    if (url) setScanUrl(url);
    document.getElementById("app")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* ─── Sticky Nav ─── */}
      <StickyNav rep={myRep} />

      <main className="flex-1">
        {/* ─── Hero ─── */}
        <section className="pt-20 pb-12 md:pt-28 md:pb-16">
          <div className="max-w-6xl mx-auto px-5 text-center">
            <div className="inline-flex items-center gap-2 gl-chip gl-chip-accent mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 gl-live-dot" />
              Live on GenLayer studionet
              <span className="opacity-40">·</span>
              <a
                href={explorerUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono opacity-80 hover:opacity-100"
              >
                {shortAddr(CONTRACT_ADDRESS)}
              </a>
            </div>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05] mb-6">
              <span className="gl-heading">Copyright enforcement</span>
              <br />
              <span className="gl-heading-accent">judged on-chain by AI.</span>
            </h1>
            <p className="text-base md:text-lg text-[color:var(--foreground-muted)] max-w-2xl mx-auto mb-8">
              Register a work, let GenLayer validators fetch any suspect URL, read it live,
              and reach LLM consensus on whether it infringes — with a bounty for the first
              honest report.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <a
                href="#app"
                className="gl-btn-primary px-6 py-3 rounded-xl font-semibold text-sm inline-flex items-center gap-2 transition-transform"
              >
                Try it now
                <span aria-hidden>→</span>
              </a>
              <a
                href="#how"
                className="gl-btn-ghost px-6 py-3 rounded-xl font-semibold text-sm inline-flex items-center gap-2"
              >
                How it works
              </a>
              <a
                href={explorerUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="gl-btn-ghost px-6 py-3 rounded-xl font-semibold text-sm inline-flex items-center gap-2"
              >
                Explorer
                <span aria-hidden className="text-xs opacity-60">↗</span>
              </a>
            </div>
          </div>
        </section>

        {/* ─── Stats ─── */}
        <section className="pb-16 md:pb-20">
          <div className="max-w-6xl mx-auto px-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              <StatTile
                label="Registered works"
                value={statsLoading ? "…" : String(stats.works)}
                sub="on-chain"
              />
              <StatTile
                label="Anchored"
                value={statsLoading ? "…" : String(stats.anchored)}
                sub="LLM-consensus snapshot"
              />
              <StatTile
                label="Infringements found"
                value={statsLoading ? "…" : String(stats.infringements)}
                sub="cumulative"
                tone={stats.infringements > 0 ? "danger" : "muted"}
              />
              <StatTile
                label="Bounty pool"
                value={statsLoading ? "…" : `${stats.bountyTotal.toLocaleString()} wei`}
                sub="funded by owners"
              />
            </div>
          </div>
        </section>

        {/* ─── Problem ─── */}
        <SectionShell id="problem" eyebrow="The problem" title="Enforcement is manual, slow, and centralized.">
          <div className="grid md:grid-cols-3 gap-4">
            <ProblemCard
              title="Human moderation queues"
              body="DMCA takedowns take days. Platform reviewers batch-eyeball claims and reject the ambiguous ones for safety."
            />
            <ProblemCard
              title="One arbiter, one bias"
              body="A single AI check can be gamed with prompt injection or a fine-tuned adversarial model. There is no jury."
            />
            <ProblemCard
              title="No native web on chains"
              body="Solidity can not fetch a page or judge similarity. Every existing on-chain claim leans on an off-chain oracle you have to trust."
            />
          </div>
        </SectionShell>

        {/* ─── How it works ─── */}
        <SectionShell id="how" eyebrow="How it works" title="Four steps. All on-chain.">
          <div className="grid md:grid-cols-4 gap-4">
            <HowStep
              n={1}
              title="Register"
              body="Owner posts the work URL, a description, license price, and penalty. Stored in a TreeMap keyed by work_id."
              api="register_work(url, desc, price, penalty)"
            />
            <HowStep
              n={2}
              title="Anchor"
              body="Validators fetch the URL, run an LLM summary, and reach consensus. The summary is stored as the trusted snapshot."
              api="anchor_work(work_id)"
            />
            <HowStep
              n={3}
              title="Scan"
              body="Anyone submits a suspect URL. Validators fetch it, prompt each own LLM, and vote on INFRINGEMENT / CLEAR / UNCERTAIN."
              api="scan_for_infringement(work_id, suspect_url)"
            />
            <HowStep
              n={4}
              title="Settle"
              body="The first honest INFRINGEMENT verdict for a canonical URL pays the reporter from the work's bounty pool. Replays return the same verdict, no double-pay."
              api="withdraw()"
            />
          </div>
        </SectionShell>

        {/* ─── The App ─── */}
        <section id="app" className="py-16 md:py-24 scroll-mt-16">
          <div className="max-w-5xl mx-auto px-5">
            <div className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
              <div>
                <div className="gl-section-eyebrow mb-2">Try the app</div>
                <h2 className="text-3xl md:text-4xl font-bold gl-heading">
                  Register, anchor, scan — live on studionet.
                </h2>
                <p className="text-sm text-[color:var(--foreground-muted)] mt-2 max-w-2xl">
                  The frontend spins up an in-browser burner signer per tab.
                  Reads are always free; writes cost a few wei from the auto-funded burner.
                </p>
              </div>
              <a
                href={explorerUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="gl-btn-ghost px-4 py-2 rounded-lg font-medium text-xs inline-flex items-center gap-2 self-start"
              >
                Contract on Explorer
                <span className="opacity-60" aria-hidden>↗</span>
              </a>
            </div>

            {contractPaused && (
              <div className="mb-5 px-4 py-3 rounded-lg border text-sm bg-orange-500/10 border-orange-500/30 text-orange-300">
                <b>Contract is paused by admin.</b> Reads still work; writes
                are temporarily frozen. <code className="font-mono text-xs">withdraw()</code>{" "}
                stays available as a safety valve.
              </div>
            )}

            {/* Tabs */}
            <div className="gl-scroll-x -mx-2 px-2 mb-5">
              <div className="inline-flex gap-1 min-w-full bg-card/50 backdrop-blur-sm rounded-xl p-1 border border-card-border">
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => {
                      setActiveTab(t.key);
                      setStatus(null);
                    }}
                    className={`flex-1 min-w-[7.5rem] whitespace-nowrap py-2.5 px-3 rounded-lg text-sm font-medium transition-all ${
                      activeTab === t.key
                        ? "bg-accent text-white shadow-lg shadow-[color:var(--accent-glow)]"
                        : "text-[color:var(--foreground-muted)] hover:text-foreground hover:bg-white/5"
                    }`}
                  >
                    <span className="mr-1.5 font-mono">{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {loading && loadingStep && (
              <div className="mb-3 px-4 py-2 rounded-lg border text-xs bg-blue-500/10 border-blue-500/30 text-blue-200 flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-blue-300/40 border-t-blue-300 rounded-full animate-spin" />
                {loadingStep}
              </div>
            )}

            {status && (
              <div className={`mb-6 px-4 py-3 rounded-lg border text-sm ${statusClasses(status.type)}`}>
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
              <div className="gl-card p-6 md:p-7">
                <div className="mb-5">
                  <h3 className="text-xl font-bold">Register original work</h3>
                  <p className="text-sm text-[color:var(--foreground-muted)] mt-1">
                    Store your IP reference URL + a description of what infringement looks
                    like. Anchoring in Step 2 fetches the page and locks the snapshot.
                  </p>
                </div>
                <form onSubmit={handleRegister} className="space-y-4">
                  <Field label="Work URL">
                    <input
                      type="url"
                      placeholder="https://your-article.com/post-42"
                      value={regUrl}
                      onChange={(e) => setRegUrl(e.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Work description &amp; infringement criteria (min 20 chars)">
                    <textarea
                      rows={4}
                      placeholder="Describe the work and what would constitute infringement — the LLM reads this at scan time."
                      value={regDesc}
                      onChange={(e) => setRegDesc(e.target.value)}
                      required
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="License price (wei)">
                      <input
                        type="number"
                        value={regPrice}
                        onChange={(e) => setRegPrice(e.target.value)}
                        required
                        min="0"
                      />
                    </Field>
                    <Field label="Penalty amount (wei)">
                      <input
                        type="number"
                        value={regPenalty}
                        onChange={(e) => setRegPenalty(e.target.value)}
                        required
                        min="0"
                      />
                    </Field>
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full gl-btn-primary py-3 rounded-xl font-semibold text-sm"
                  >
                    {loading ? "Registering…" : "Register work"}
                  </button>
                </form>
                {registeredId && (
                  <div className="mt-4 p-4 rounded-xl border border-green-500/30 bg-green-500/10">
                    <p className="text-sm text-green-300">
                      Work ID: <code className="font-mono font-bold">{registeredId}</code>{" "}
                      — next step: open <b>View Work</b>, load it, and click{" "}
                      <b>Anchor Work</b>.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* License */}
            {activeTab === "license" && (
              <div className="gl-card p-6 md:p-7">
                <div className="mb-5">
                  <h3 className="text-xl font-bold">Purchase a license</h3>
                  <p className="text-sm text-[color:var(--foreground-muted)] mt-1">
                    Pay at least the listed price. Success mints a per-address license —
                    read it back with <code className="font-mono text-xs">has_license</code>.
                  </p>
                </div>
                <form onSubmit={handleLicense} className="space-y-4">
                  <Field label="Work ID">
                    <input
                      type="text"
                      placeholder="work_1"
                      value={licWorkId}
                      onChange={(e) => setLicWorkId(e.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Payment amount (wei)">
                    <input
                      type="number"
                      value={licValue}
                      onChange={(e) => setLicValue(e.target.value)}
                      required
                      min="0"
                    />
                  </Field>
                  <button type="submit" disabled={loading} className="w-full gl-btn-primary py-3 rounded-xl font-semibold text-sm">
                    {loading ? "Processing…" : "Purchase license"}
                  </button>
                </form>
              </div>
            )}

            {/* Scan */}
            {activeTab === "scan" && (
              <div className="gl-card p-6 md:p-7">
                <div className="mb-5">
                  <h3 className="text-xl font-bold">Scan for infringement</h3>
                  <p className="text-sm text-[color:var(--foreground-muted)] mt-1">
                    Validators fetch the suspect URL live, prompt their own LLM, and
                    settle by consensus. The judgment lands on-chain as a JSON verdict.
                  </p>
                </div>
                <form onSubmit={handleScan} className="space-y-4">
                  <Field label="Work ID">
                    <input
                      type="text"
                      placeholder="work_1"
                      value={scanWorkId}
                      onChange={(e) => setScanWorkId(e.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Suspect URL">
                    <input
                      type="url"
                      placeholder="https://example.com/"
                      value={scanUrl}
                      onChange={(e) => setScanUrl(e.target.value)}
                      required
                    />
                  </Field>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setScanWorkId("work_1");
                        setScanUrl("https://example.com/");
                      }}
                      className="gl-btn-ghost px-3 py-1.5 rounded-lg"
                    >
                      Preset: CLEAR → work_1 vs example.com
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setScanWorkId("work_1");
                        setScanUrl("https://docs.genlayer.com/");
                      }}
                      className="gl-btn-ghost px-3 py-1.5 rounded-lg"
                    >
                      Preset: INFRINGEMENT → work_1 vs registered URL
                    </button>
                  </div>
                  <button type="submit" disabled={loading} className="w-full gl-btn-primary py-3 rounded-xl font-semibold text-sm">
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Scanning &amp; reaching consensus…
                      </span>
                    ) : (
                      "Scan URL"
                    )}
                  </button>
                </form>

                {verdictResult && (
                  <VerdictPanel
                    v={verdictResult}
                    appeal={appealView}
                    requiredStake={requiredStake}
                    appealStake={appealStake}
                    onStakeChange={setAppealStake}
                    onFileAppeal={() =>
                      handleFileAppeal(normaliseWorkId(scanWorkId), scanUrl)
                    }
                    onResolveAppeal={() =>
                      handleResolveAppeal(normaliseWorkId(scanWorkId), scanUrl)
                    }
                    loading={loading}
                  />
                )}
              </div>
            )}

            {/* View */}
            {activeTab === "view" && (
              <div className="gl-card p-6 md:p-7">
                <div className="mb-5">
                  <h3 className="text-xl font-bold">View work details</h3>
                  <p className="text-sm text-[color:var(--foreground-muted)] mt-1">
                    Anchoring is owner-only. Run it once per work — later scans compare
                    the suspect page against the anchored snapshot, not just the description.
                  </p>
                </div>
                <form onSubmit={handleView} className="space-y-4">
                  <Field label="Work ID">
                    <input
                      type="text"
                      placeholder="work_1"
                      value={viewWorkId}
                      onChange={(e) => setViewWorkId(e.target.value)}
                      required
                    />
                  </Field>
                  <button type="submit" disabled={loading} className="w-full gl-btn-primary py-3 rounded-xl font-semibold text-sm">
                    {loading ? "Loading…" : "View work"}
                  </button>
                </form>

                {workInfo && (
                  <div className="mt-6 space-y-3">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <InfoCard label="Work ID" value={workInfo.work_id} />
                      <InfoCard
                        label="Infringements"
                        value={String(workInfo.infringement_count)}
                        highlight={workInfo.infringement_count > 0}
                      />
                      <InfoCard label="License price" value={`${workInfo.license_price} wei`} />
                      <InfoCard label="Penalty" value={`${workInfo.penalty_amount} wei`} />
                    </div>
                    <div className="p-3 gl-card rounded-xl">
                      <p className="text-xs text-[color:var(--foreground-muted)] mb-1">Owner</p>
                      <p className="text-xs font-mono break-all">{workInfo.owner}</p>
                    </div>
                    <div className="p-3 gl-card rounded-xl">
                      <p className="text-xs text-[color:var(--foreground-muted)] mb-1">Reference URL</p>
                      <a
                        href={workInfo.work_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[color:var(--accent-2)] hover:underline break-all"
                      >
                        {workInfo.work_url}
                      </a>
                    </div>
                    <div className="p-3 gl-card rounded-xl">
                      <p className="text-xs text-[color:var(--foreground-muted)] mb-1">Description</p>
                      <p className="text-sm">{workInfo.work_desc}</p>
                    </div>
                    {(() => {
                      const isOwner =
                        !!workInfo.owner &&
                        workInfo.owner.toLowerCase() === BURNER_ADDRESS.toLowerCase();
                      if (!isOwner && !workInfo.scans_disabled) return null;
                      return (
                        <div className="p-3 gl-card rounded-xl space-y-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <p className="text-xs text-[color:var(--foreground-muted)]">
                              Scan availability{" "}
                              <span
                                className={`ml-2 px-2 py-0.5 rounded-full text-[10px] border ${
                                  workInfo.scans_disabled
                                    ? "bg-orange-500/10 border-orange-500/30 text-orange-300"
                                    : "bg-green-500/10 border-green-500/30 text-green-300"
                                }`}
                              >
                                {workInfo.scans_disabled ? "disabled by owner" : "open"}
                              </span>
                              {isOwner && (
                                <span className="ml-2 gl-chip text-[10px]">you are the owner</span>
                              )}
                            </p>
                            {isOwner && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleToggleScans(
                                    workInfo.work_id,
                                    !workInfo.scans_disabled
                                  )
                                }
                                disabled={loading}
                                className="gl-btn-ghost px-3 py-1.5 text-xs rounded-lg font-semibold"
                              >
                                {workInfo.scans_disabled
                                  ? "Re-enable scans"
                                  : "Disable scans"}
                              </button>
                            )}
                          </div>
                          <p className="text-[11px] text-[color:var(--foreground-muted)]">
                            v6 · owner-only kill switch to freeze{" "}
                            <code className="font-mono">scan_for_infringement</code>{" "}
                            against this work without pausing the whole contract.
                          </p>
                        </div>
                      );
                    })()}
                    <div className="p-3 gl-card rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-[color:var(--foreground-muted)]">
                          Content anchor
                          <span
                            className={`ml-2 px-2 py-0.5 rounded-full text-[10px] border ${
                              workInfo.anchored
                                ? "bg-green-500/10 border-green-500/30 text-green-300"
                                : "bg-gray-500/10 border-gray-500/30 text-gray-300"
                            }`}
                          >
                            {workInfo.anchored ? "anchored" : "not anchored"}
                          </span>
                        </p>
                        {!workInfo.anchored && (
                          <button
                            type="button"
                            onClick={() => handleAnchor(workInfo.work_id)}
                            disabled={loading}
                            className="gl-btn-primary px-3 py-1.5 text-xs rounded-lg font-semibold"
                          >
                            {loading ? "Anchoring…" : "Anchor work"}
                          </button>
                        )}
                      </div>
                      {workInfo.anchored && workInfo.anchor_summary && (
                        <p className="text-sm text-[color:var(--foreground)]">
                          {workInfo.anchor_summary}
                        </p>
                      )}
                      {!workInfo.anchored && (
                        <p className="text-xs text-[color:var(--foreground-muted)]">
                          Owner-only. Fetches the reference URL and stores an
                          LLM-consensus summary of the page as immutable provenance
                          on-chain.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Browse */}
            {activeTab === "browse" && (
              <div className="gl-card p-6 md:p-7">
                <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                  <div>
                    <h3 className="text-xl font-bold">Registered works</h3>
                    <p className="text-sm text-[color:var(--foreground-muted)] mt-1">
                      Snapshot from the on-chain <code className="font-mono text-xs">list_works</code> view.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleBrowse}
                    disabled={loading}
                    className="gl-btn-ghost px-4 py-2 rounded-lg text-sm font-semibold"
                  >
                    {loading ? "Loading…" : browseList ? "Refresh" : "Load works"}
                  </button>
                </div>

                {browseList === null && (
                  <p className="text-sm text-[color:var(--foreground-muted)]">
                    Click <b>Load works</b> to fetch the live list.
                  </p>
                )}

                {browseList && browseList.length === 0 && (
                  <p className="text-sm text-[color:var(--foreground-muted)]">No works registered yet.</p>
                )}

                {browseList && browseList.length > 0 && (
                  <div className="space-y-3">
                    {browseList.map((w) => (
                      <div key={w.work_id} className="gl-card gl-card-hover p-4">
                        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                          <span className="font-mono text-sm font-bold">{w.work_id}</span>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full border ${
                                w.anchored
                                  ? "bg-green-500/10 border-green-500/30 text-green-300"
                                  : "bg-gray-500/10 border-gray-500/30 text-gray-300"
                              }`}
                            >
                              {w.anchored ? "anchored" : "unanchored"}
                            </span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full border ${
                                w.infringement_count > 0
                                  ? "bg-red-500/10 border-red-500/30 text-red-300"
                                  : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                              }`}
                            >
                              {w.infringement_count} infringement(s)
                            </span>
                          </div>
                        </div>
                        <a
                          href={w.work_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[color:var(--accent-2)] break-all hover:underline"
                        >
                          {w.work_url}
                        </a>
                        <div className="grid grid-cols-3 gap-3 mt-3 text-xs">
                          <div>
                            <p className="text-[color:var(--foreground-muted)] mb-0.5">License</p>
                            <p className="font-mono">{w.license_price} wei</p>
                          </div>
                          <div>
                            <p className="text-[color:var(--foreground-muted)] mb-0.5">Penalty</p>
                            <p className="font-mono">{w.penalty_amount} wei</p>
                          </div>
                          <div>
                            <p className="text-[color:var(--foreground-muted)] mb-0.5">Bounty pool</p>
                            <p className="font-mono">{w.bounty_pool} wei</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-3 gap-2 flex-wrap">
                          <p className="text-[10px] text-[color:var(--foreground-muted)] break-all font-mono">
                            Owner: {shortAddr(w.owner, 10, 6)}
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setViewWorkId(w.work_id);
                                setActiveTab("view");
                                handleView(new Event("submit") as unknown as React.FormEvent);
                              }}
                              className="gl-btn-ghost px-3 py-1 text-[11px] rounded-lg"
                            >
                              View
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                usePrefilled(w.work_id, "https://example.com/")
                              }
                              className="gl-btn-ghost px-3 py-1 text-[11px] rounded-lg"
                            >
                              Scan vs example.com
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ─── Verdict examples ─── */}
        <SectionShell
          id="verdicts"
          eyebrow="Verdict shapes"
          title="Three buckets. All reached by validator LLM consensus."
        >
          <div className="grid md:grid-cols-3 gap-4">
            <VerdictExampleCard
              verdict="INFRINGEMENT"
              similarity={100}
              rule="similarity ≥ 70 · verdicts must match"
              body="Suspect page substantially reproduces the anchored work. Bounty pays the first honest reporter for that canonical URL."
            />
            <VerdictExampleCard
              verdict="CLEAR"
              similarity={8}
              rule="similarity < 40 · verdicts must match"
              body="Unrelated content. No count, no bounty, no penalty. Verdict + reasoning are still stored on-chain for the record."
            />
            <VerdictExampleCard
              verdict="UNCERTAIN"
              similarity={55}
              rule="40 ≤ similarity < 70 · or fetch/injection flag set"
              body="Ambiguous or the fetch failed or a prompt-injection canary tripped. Forced UNCERTAIN — never quietly buckets to a verdict."
            />
          </div>
        </SectionShell>

        {/* ─── Consensus signals ─── */}
        <SectionShell
          id="signals"
          eyebrow="Consensus signals"
          title="Every verdict carries reviewer-checkable metadata."
        >
          <div className="grid md:grid-cols-2 gap-4">
            <SignalCard
              name="fetch_failed"
              body="Set when gl.nondet.web.render throws. The principle forces UNCERTAIN if either side reports it — a validator cannot silently disagree because of transient DNS."
            />
            <SignalCard
              name="injection_attempt"
              body="A per-scan canary token is embedded in the prompt. If the model echoes it, the output is discarded and the verdict is UNCERTAIN — prompt injection can not steer the verdict."
            />
            <SignalCard
              name="registered_url_shortcut"
              body="If the suspect URL canonicalizes to the same identity as the registered work URL, the contract returns INFRINGEMENT deterministically — no LLM run and no bounty payout on self-scans."
            />
            <SignalCard
              name="canonical_url"
              body="http↔https, case, www., default ports, trailing slash, fragment, and tracking params (utm_*, fbclid, gclid…) are stripped so alias variants collapse to one evidence slot."
            />
            <SignalCard
              name="already_credited"
              body="Bounty pays only the first honest INFRINGEMENT for a canonical URL. Replays return the same verdict but do not double-pay."
            />
            <SignalCard
              name="similarity"
              body="Integer 0–100. Must sit inside its declared bucket and be within 15 points of the leader (tightened in v6) — larger drift is disagreement."
            />
            <SignalCard
              name="perspectives (v6)"
              body="Every verdict carries three named lenses — legal / forensic / skeptic. Each is a non-empty sentence. Consensus principle rejects a validator that skipped a lens."
            />
          </div>
        </SectionShell>

        {/* ─── Architecture ─── */}
        <SectionShell id="architecture" eyebrow="Architecture" title="One flow, three trust layers.">
          <div className="grid md:grid-cols-3 gap-4">
            <ArchCard
              layer="Client"
              title="Next.js dApp"
              rows={[
                "genlayer-js SDK",
                "in-browser burner (per tab)",
                "auto-fund via studionet provider",
                "reads free · writes signed by burner",
              ]}
            />
            <ArchCard
              layer="Contract"
              title="Intelligent Contract (Python)"
              rows={[
                "gl.eq_principle.prompt_comparative",
                "TreeMap[str,_] storage only (R14/R19)",
                "canonical URL + sha256 evidence keys",
                "checked_add/sub on all u256 math",
              ]}
              accent
            />
            <ArchCard
              layer="Consensus"
              title="Validator jury"
              rows={[
                "gl.nondet.web.render() — live fetch",
                "gl.nondet.exec_prompt() — LLM judgment",
                "principle checks meaning, not schema",
                "Optimistic Democracy · leader + votes",
              ]}
            />
          </div>
          <div className="mt-6 p-4 gl-card">
            <p className="text-xs text-[color:var(--foreground-muted)] mb-2 font-mono">
              scan_for_infringement(work_id, suspect_url)
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <FlowNode>frontend</FlowNode>
              <Arrow />
              <FlowNode accent>writeContract</FlowNode>
              <Arrow />
              <FlowNode>leader validator</FlowNode>
              <Arrow />
              <FlowNode>gl.nondet.web.render</FlowNode>
              <Arrow />
              <FlowNode>gl.nondet.exec_prompt</FlowNode>
              <Arrow />
              <FlowNode>N validators re-run + vote</FlowNode>
              <Arrow />
              <FlowNode accent>on-chain verdict</FlowNode>
            </div>
          </div>
        </SectionShell>

        {/* ─── Use cases ─── */}
        <SectionShell id="use-cases" eyebrow="Use cases" title="Where an on-chain jury beats a hosted classifier.">
          <div className="grid md:grid-cols-3 gap-4">
            <UseCaseCard
              icon="📰"
              title="Editorial IP"
              body="Independent journalists register long-reads. Bots scan aggregator sites. The first honest INFRINGEMENT report gets paid; the paper wins takedown evidence signed by a jury."
            />
            <UseCaseCard
              icon="🎨"
              title="Digital art licensing"
              body="Artists list a license price and a penalty. Buyers mint a per-address license. Repost detection runs against the anchored snapshot, not the artist's word."
            />
            <UseCaseCard
              icon="📚"
              title="Docs mirrors"
              body="OSS teams pin the canonical docs URL. Mirrors that copy verbatim register as INFRINGEMENT; forks that summarize register as CLEAR — with reasoning."
            />
            <UseCaseCard
              icon="🎧"
              title="Podcast transcripts"
              body="Anchor the transcript. Suspect blog posts that lift chunks are flagged, and the bounty covers legal outreach cost."
            />
            <UseCaseCard
              icon="📈"
              title="Research reports"
              body="A paywalled report is anchored. Any public leak that scores ≥ 70 similarity is on-chain evidence for a takedown request."
            />
            <UseCaseCard
              icon="⚖️"
              title="Contract arbitration"
              body="Any dispute reducible to did-X-copy-Y with a suspect URL is a scan — bring your own dispute registry and hook this in."
            />
          </div>
        </SectionShell>

        {/* ─── Compare ─── */}
        <SectionShell id="compare" eyebrow="Why GenLayer" title="What Solidity cannot do.">
          <div className="overflow-x-auto gl-scroll-x -mx-2 px-2">
            <table className="min-w-[42rem] w-full text-sm">
              <thead>
                <tr className="text-left text-[color:var(--foreground-muted)]">
                  <th className="py-3 px-4 font-semibold">Requirement</th>
                  <th className="py-3 px-4 font-semibold">Solidity + oracle</th>
                  <th className="py-3 px-4 font-semibold text-[color:var(--accent-2)]">
                    GenLayer Intelligent Contract
                  </th>
                </tr>
              </thead>
              <tbody>
                <CompareRow
                  what="Fetch a suspect URL live"
                  sol="Requires trusted oracle contract"
                  gl="gl.nondet.web.render() at consensus time"
                />
                <CompareRow
                  what="Judge similarity of unstructured text"
                  sol="Not possible on-chain"
                  gl="gl.nondet.exec_prompt() with validator LLMs"
                />
                <CompareRow
                  what="Reach consensus on a subjective call"
                  sol="Single-source answer, no jury"
                  gl="prompt_comparative — principle checks meaning"
                />
                <CompareRow
                  what="Store evidence + reasoning immutably"
                  sol="Yes"
                  gl="Yes"
                  match
                />
                <CompareRow
                  what="Pay a bounty on first honest report"
                  sol="Yes (with off-chain trigger)"
                  gl="Yes, triggered by the on-chain verdict"
                />
                <CompareRow
                  what="Resist prompt injection"
                  sol="N/A — no LLM in loop"
                  gl="Canary token + forced UNCERTAIN"
                />
              </tbody>
            </table>
          </div>
        </SectionShell>

        {/* ─── How to use (reviewer script) ─── */}
        <SectionShell id="how-to-use" eyebrow="Reviewer script" title="Five minutes, no wallet install.">
          <ol className="space-y-3">
            <ReviewerStep
              n={1}
              title="Open the app. It boots a burner signer automatically."
              body="No MetaMask prompt, no seed phrase. studionet auto-funds the burner via the provider."
            />
            <ReviewerStep
              n={2}
              title="Browse Works → confirm 3+ records, one anchored."
              body="work_1 shows anchored + infringement_count ≥ 1."
            />
            <ReviewerStep
              n={3}
              title="Scan vs example.com → CLEAR."
              body="A real gl.nondet.exec_prompt run — reasoning differs each time, verdict bucket does not."
            />
            <ReviewerStep
              n={4}
              title="Scan vs docs.genlayer.com → INFRINGEMENT."
              body="Registered-URL shortcut path — deterministic INFRINGEMENT, no bounty paid on self-scans."
            />
            <ReviewerStep
              n={5}
              title="Purchase License work_1 for 1000 wei."
              body="has_license(work_1, <your address>) returns true — verified on the same contract."
            />
          </ol>
        </SectionShell>

        {/* ─── FAQ ─── */}
        <SectionShell id="faq" eyebrow="FAQ" title="Questions reviewers ask first.">
          <div className="grid md:grid-cols-2 gap-4">
            <FaqItem
              q="Why not just call an off-chain LLM and post the result?"
              a="Because one classifier is one bias. GenLayer runs the same prompt across many validators with different LLMs and reaches consensus by principle — a single tampered node loses the vote."
            />
            <FaqItem
              q="What stops a scanner from farming bounties?"
              a="Bounty pays the first honest INFRINGEMENT for a canonical URL. Replays return the same verdict but no payout, and the URL canonicalizer collapses trivial aliases."
            />
            <FaqItem
              q="What if the suspect URL goes 404?"
              a="fetch_failed flips true. The consensus principle forces UNCERTAIN — the contract never guesses a verdict when the evidence is missing."
            />
            <FaqItem
              q="Prompt injection?"
              a="Every scan embeds a canary token in the prompt. If the model echoes it, the output is discarded and the verdict is UNCERTAIN. The suspect content is boxed inside untrusted markers."
            />
            <FaqItem
              q="Why an in-browser burner instead of MetaMask?"
              a="Zero-friction for reviewers. studionet auto-funds the burner. Anyone can inspect the source (see genlayer.ts) — no private key ever leaves the tab."
            />
            <FaqItem
              q="Why studionet not testnet?"
              a="This is the Studio-hosted network per the project deployment decision. Contract, frontend chain, and funding source are all studionet."
            />
          </div>
        </SectionShell>
      </main>

      <Footer />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Presentational components
// ─────────────────────────────────────────────────────────────

function StickyNav({ rep }: { rep?: Reputation | null }) {
  const tierColor: Record<string, string> = {
    bronze: "bg-amber-700/20 border-amber-700/40 text-amber-200",
    silver: "bg-slate-400/20 border-slate-400/40 text-slate-100",
    gold: "bg-yellow-500/20 border-yellow-500/40 text-yellow-200",
  };
  return (
    <header className="gl-nav sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between gap-3">
        <a href="#" className="flex items-center gap-3 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-128.png"
            alt="LicenseLogic"
            width={36}
            height={36}
            className="w-9 h-9 rounded-lg flex-shrink-0"
          />
          <div className="min-w-0">
            <div className="text-sm font-bold tracking-tight leading-tight">LicenseLogic</div>
            <div className="text-[10px] text-[color:var(--foreground-muted)] leading-tight hidden sm:block">
              AI-powered IP licensing on GenLayer
            </div>
          </div>
        </a>
        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="gl-nav-link">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {rep && (
            <span
              className={`hidden lg:inline gl-chip ${tierColor[rep.tier] || ""} font-mono`}
              title={`Your reputation: ${rep.honest_scans} honest / ${rep.overturned_scans} overturned · ${rep.bounty_share_pct}% bounty share`}
            >
              you · {rep.tier}
            </span>
          )}
          <span className="hidden lg:inline gl-chip">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 gl-live-dot" />
            {NETWORK_LABEL}
          </span>
          <a
            href={explorerUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="gl-btn-ghost px-3 py-1.5 rounded-lg text-xs font-mono hidden sm:inline-flex items-center gap-1"
          >
            {CONTRACT_ADDRESS?.slice(0, 6)}…{CONTRACT_ADDRESS?.slice(-4)}
            <span className="opacity-60" aria-hidden>↗</span>
          </a>
          <a
            href="#app"
            className="gl-btn-primary px-4 py-1.5 rounded-lg text-xs font-semibold"
          >
            Try it
          </a>
        </div>
      </div>
    </header>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[color:var(--foreground-muted)] mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function SectionShell({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="py-16 md:py-24 scroll-mt-16">
      <div className="max-w-6xl mx-auto px-5">
        <div className="mb-8 md:mb-10">
          <div className="gl-section-eyebrow mb-2">{eyebrow}</div>
          <h2 className="text-2xl md:text-4xl font-bold gl-heading max-w-3xl">{title}</h2>
        </div>
        {children}
      </div>
    </section>
  );
}

function StatTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "danger" | "muted";
}) {
  const valColor =
    tone === "danger" ? "text-red-300" : tone === "muted" ? "text-[color:var(--foreground)]" : "text-[color:var(--foreground)]";
  return (
    <div className="gl-card p-4 md:p-5">
      <div className="text-[11px] uppercase tracking-widest text-[color:var(--foreground-muted)] mb-2">
        {label}
      </div>
      <div className={`text-2xl md:text-3xl font-bold gl-stat-num ${valColor}`}>{value}</div>
      {sub && <div className="text-[11px] text-[color:var(--foreground-muted)] mt-1">{sub}</div>}
    </div>
  );
}

function ProblemCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="gl-card p-5">
      <div className="text-sm font-semibold mb-1.5">{title}</div>
      <p className="text-sm text-[color:var(--foreground-muted)] leading-relaxed">{body}</p>
    </div>
  );
}

function HowStep({
  n,
  title,
  body,
  api,
}: {
  n: number;
  title: string;
  body: string;
  api: string;
}) {
  return (
    <div className="gl-card p-5 gl-card-hover">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-7 h-7 rounded-lg bg-accent/15 border border-accent/30 text-[color:var(--accent-2)] text-xs font-bold flex items-center justify-center">
          {n}
        </span>
        <div className="text-sm font-semibold">{title}</div>
      </div>
      <p className="text-sm text-[color:var(--foreground-muted)] leading-relaxed mb-3">{body}</p>
      <code className="text-[10px] font-mono block bg-black/30 border border-card-border rounded-md px-2 py-1.5 text-[color:var(--accent-2)] break-all">
        {api}
      </code>
    </div>
  );
}

function VerdictExampleCard({
  verdict,
  similarity,
  rule,
  body,
}: {
  verdict: string;
  similarity: number;
  rule: string;
  body: string;
}) {
  return (
    <div className="gl-card p-5 gl-card-hover">
      <div className="flex items-center justify-between mb-3">
        <VerdictBadge verdict={verdict} />
        <span className="text-xs font-mono text-[color:var(--foreground-muted)]">{similarity}%</span>
      </div>
      <SimilarityBar score={similarity} />
      <p className="text-xs text-[color:var(--foreground-muted)] mt-3 font-mono">{rule}</p>
      <p className="text-sm mt-3 text-[color:var(--foreground)]">{body}</p>
    </div>
  );
}

function PerspectiveCell({ label, body }: { label: string; body?: string }) {
  return (
    <div className="p-3 gl-card rounded-lg">
      <div className="text-[10px] uppercase tracking-widest text-[color:var(--accent-2)] mb-1">
        {label}
      </div>
      <p className="text-xs text-[color:var(--foreground)] leading-relaxed">
        {body?.trim() || <span className="text-[color:var(--foreground-muted)] italic">no lens returned</span>}
      </p>
    </div>
  );
}

function SignalCard({ name, body }: { name: string; body: string }) {
  return (
    <div className="gl-card p-5">
      <code className="text-xs font-mono text-[color:var(--accent-2)]">{name}</code>
      <p className="text-sm text-[color:var(--foreground-muted)] mt-2 leading-relaxed">{body}</p>
    </div>
  );
}

function ArchCard({
  layer,
  title,
  rows,
  accent,
}: {
  layer: string;
  title: string;
  rows: string[];
  accent?: boolean;
}) {
  return (
    <div className={`gl-card p-5 ${accent ? "border-[color:var(--accent)]/40" : ""}`}>
      <div className="gl-section-eyebrow mb-1">{layer}</div>
      <div className="text-lg font-bold mb-3">{title}</div>
      <ul className="space-y-1.5 text-xs text-[color:var(--foreground-muted)]">
        {rows.map((r) => (
          <li key={r} className="flex items-start gap-2">
            <span className="text-[color:var(--accent-2)] mt-0.5">›</span>
            <code className="font-mono break-all">{r}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FlowNode({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className={`inline-flex items-center px-3 py-1.5 rounded-lg border font-mono text-xs whitespace-nowrap ${
        accent
          ? "bg-accent/10 border-accent/40 text-[color:var(--accent-2)]"
          : "bg-white/5 border-card-border text-[color:var(--foreground-muted)]"
      }`}
    >
      {children}
    </span>
  );
}

function Arrow() {
  return <span className="text-[color:var(--muted)]" aria-hidden>→</span>;
}

function UseCaseCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="gl-card p-5 gl-card-hover">
      <div className="text-2xl mb-2" aria-hidden>{icon}</div>
      <div className="text-sm font-semibold mb-1.5">{title}</div>
      <p className="text-sm text-[color:var(--foreground-muted)] leading-relaxed">{body}</p>
    </div>
  );
}

function CompareRow({
  what,
  sol,
  gl,
  match,
}: {
  what: string;
  sol: string;
  gl: string;
  match?: boolean;
}) {
  return (
    <tr className="border-t border-card-border">
      <td className="py-3 px-4 font-medium">{what}</td>
      <td className="py-3 px-4 text-[color:var(--foreground-muted)]">{sol}</td>
      <td className={`py-3 px-4 ${match ? "text-[color:var(--foreground-muted)]" : "text-[color:var(--accent-2)]"}`}>
        {gl}
      </td>
    </tr>
  );
}

function ReviewerStep({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="gl-card p-4 flex gap-4">
      <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-accent/15 border border-accent/30 text-[color:var(--accent-2)] font-bold flex items-center justify-center">
        {n}
      </span>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <p className="text-sm text-[color:var(--foreground-muted)] mt-1">{body}</p>
      </div>
    </li>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="gl-card p-5 gl-card-hover group open:border-[color:var(--accent)]/40">
      <summary className="cursor-pointer text-sm font-semibold flex items-center justify-between gap-3">
        <span>{q}</span>
        <span className="text-[color:var(--accent-2)] transition-transform group-open:rotate-45" aria-hidden>+</span>
      </summary>
      <p className="text-sm text-[color:var(--foreground-muted)] mt-3 leading-relaxed">{a}</p>
    </details>
  );
}

function VerdictPanel({
  v,
  appeal,
  requiredStake,
  appealStake,
  onStakeChange,
  onFileAppeal,
  onResolveAppeal,
  loading,
}: {
  v: Verdict;
  appeal?: AppealView | null;
  requiredStake?: number | null;
  appealStake?: string;
  onStakeChange?: (s: string) => void;
  onFileAppeal?: () => void;
  onResolveAppeal?: () => void;
  loading?: boolean;
}) {
  return (
    <div className="mt-6 p-5 gl-card space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-lg">Consensus verdict</h4>
        <VerdictBadge verdict={v.verdict} />
      </div>
      <div>
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-[color:var(--foreground-muted)]">Similarity</span>
          <span className="font-mono font-bold">{v.similarity}%</span>
        </div>
        <SimilarityBar score={v.similarity} />
      </div>
      <div>
        <p className="text-xs text-[color:var(--foreground-muted)] mb-1">Reasoning</p>
        <p className="text-sm">{v.reasoning}</p>
      </div>
      <div>
        <p className="text-xs text-[color:var(--foreground-muted)] mb-1">Matched elements</p>
        <p className="text-xs font-mono">{v.matched_elements}</p>
      </div>
      {v.perspectives && (v.perspectives.legal || v.perspectives.forensic || v.perspectives.skeptic) && (
        <div>
          <p className="text-xs text-[color:var(--foreground-muted)] mb-2">
            Validator perspectives{" "}
            <span className="gl-chip gl-chip-accent text-[10px]">v6 · multi-lens</span>
          </p>
          <div className="grid md:grid-cols-3 gap-2">
            <PerspectiveCell label="Legal" body={v.perspectives.legal} />
            <PerspectiveCell label="Forensic" body={v.perspectives.forensic} />
            <PerspectiveCell label="Skeptic" body={v.perspectives.skeptic} />
          </div>
        </div>
      )}
      {(v.already_credited || v.registered_url_shortcut || v.fetch_failed || v.injection_attempt) && (
        <div className="flex flex-wrap gap-2">
          {v.already_credited && (
            <span className="inline-block px-2 py-1 rounded-full text-[10px] bg-yellow-500/10 border border-yellow-500/30 text-yellow-300">
              replay — bounty already claimed
            </span>
          )}
          {v.registered_url_shortcut && (
            <span className="inline-block px-2 py-1 rounded-full text-[10px] bg-blue-500/10 border border-blue-500/30 text-blue-300">
              self-scan of registered URL — no bounty paid
            </span>
          )}
          {v.fetch_failed && (
            <span className="inline-block px-2 py-1 rounded-full text-[10px] bg-orange-500/10 border border-orange-500/30 text-orange-300">
              fetch failed — forced UNCERTAIN
            </span>
          )}
          {v.injection_attempt && (
            <span className="inline-block px-2 py-1 rounded-full text-[10px] bg-red-500/10 border border-red-500/30 text-red-300">
              prompt injection detected
            </span>
          )}
        </div>
      )}
      <div className="pt-2 border-t border-card-border space-y-1">
        <p className="text-[11px] text-[color:var(--foreground-muted)] break-all">
          Scanned: {v.suspect_url}
        </p>
        {v.canonical_url && v.canonical_url !== v.suspect_url && (
          <p className="text-[11px] text-[color:var(--foreground-muted)] break-all">
            Canonical evidence key:{" "}
            <span className="font-mono">{v.canonical_url}</span>
          </p>
        )}
      </div>
      <AppealPanel
        v={v}
        appeal={appeal}
        requiredStake={requiredStake}
        appealStake={appealStake}
        onStakeChange={onStakeChange}
        onFileAppeal={onFileAppeal}
        onResolveAppeal={onResolveAppeal}
        loading={loading}
      />
    </div>
  );
}

function AppealPanel({
  v,
  appeal,
  requiredStake,
  appealStake,
  onStakeChange,
  onFileAppeal,
  onResolveAppeal,
  loading,
}: {
  v: Verdict;
  appeal?: AppealView | null;
  requiredStake?: number | null;
  appealStake?: string;
  onStakeChange?: (s: string) => void;
  onFileAppeal?: () => void;
  onResolveAppeal?: () => void;
  loading?: boolean;
}) {
  const isAppealable =
    v.verdict === "INFRINGEMENT" &&
    !v.registered_url_shortcut &&
    !v.fetch_failed;
  const state = appeal?.state || "none";

  if (!isAppealable && state === "none") return null;

  const stateStyles: Record<string, string> = {
    none: "bg-white/5 border-card-border text-[color:var(--foreground-muted)]",
    pending: "bg-yellow-500/10 border-yellow-500/30 text-yellow-300",
    overturned: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
    upheld: "bg-blue-500/10 border-blue-500/30 text-blue-300",
  };
  return (
    <div className="pt-3 border-t border-card-border space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-[color:var(--foreground-muted)]">
          Appeal
          <span className="ml-2 gl-chip gl-chip-accent text-[10px]">v7 · dispute layer</span>
        </p>
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${stateStyles[state] || stateStyles.none}`}
        >
          {state}
        </span>
      </div>
      {state === "none" && isAppealable && (
        <div className="space-y-2">
          <p className="text-xs text-[color:var(--foreground-muted)]">
            Stake <b className="text-[color:var(--foreground)]">{requiredStake ?? "…"} wei</b>{" "}
            (2 × penalty) to trigger a validator-consensus re-scan. OVERTURN refunds you + slashes the scanner. UPHELD forfeits your stake to the owner.
          </p>
          <div className="flex gap-2">
            <input
              type="number"
              value={appealStake ?? ""}
              onChange={(e) => onStakeChange?.(e.target.value)}
              placeholder={requiredStake ? String(requiredStake) : "stake wei"}
              className="flex-1"
              min="0"
            />
            <button
              type="button"
              onClick={onFileAppeal}
              disabled={loading || !onFileAppeal}
              className="gl-btn-primary px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap"
            >
              File appeal
            </button>
          </div>
        </div>
      )}
      {state === "pending" && (
        <div className="space-y-2">
          <p className="text-xs text-[color:var(--foreground-muted)]">
            Appellant staked{" "}
            <span className="font-mono text-[color:var(--foreground)]">
              {appeal?.stake} wei
            </span>
            . Trigger the re-scan to get a fresh validator consensus.
          </p>
          <button
            type="button"
            onClick={onResolveAppeal}
            disabled={loading || !onResolveAppeal}
            className="gl-btn-primary px-4 py-2 rounded-lg text-xs font-semibold"
          >
            Resolve appeal (re-scan + consensus)
          </button>
        </div>
      )}
      {(state === "overturned" || state === "upheld") && appeal && (
        <div className="space-y-1">
          <p className="text-xs text-[color:var(--foreground-muted)]">
            Resolution reasoning:
          </p>
          <p className="text-sm">{appeal.resolution_reason || "(no reasoning stored)"}</p>
        </div>
      )}
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
    <div className="gl-card p-3">
      <p className="text-[10px] uppercase tracking-widest text-[color:var(--foreground-muted)] mb-1">
        {label}
      </p>
      <p
        className={`text-lg font-bold font-mono ${highlight ? "text-red-300" : "text-[color:var(--foreground)]"}`}
      >
        {value}
      </p>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-card-border pt-14 pb-8 mt-8">
      <div className="max-w-6xl mx-auto px-5 grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-3 mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-128.png" alt="LicenseLogic" width={36} height={36} className="w-9 h-9 rounded-lg" />
            <div>
              <div className="font-bold text-sm">LicenseLogic</div>
              <div className="text-[11px] text-[color:var(--foreground-muted)]">
                AI-powered IP licensing on GenLayer
              </div>
            </div>
          </div>
          <p className="text-xs text-[color:var(--foreground-muted)] max-w-sm leading-relaxed">
            Copyright judgments reached by a jury of validator LLMs, with the reasoning
            stored immutably on-chain. Built on GenLayer studionet.
          </p>
          <div className="mt-4 flex gap-2 items-center">
            <span className="gl-chip">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 gl-live-dot" />
              studionet · live
            </span>
          </div>
        </div>

        <FooterCol title="App">
          <FooterLink href="#app">Browse works</FooterLink>
          <FooterLink href="#app">Register work</FooterLink>
          <FooterLink href="#app">Scan URL</FooterLink>
          <FooterLink href="#app">Purchase license</FooterLink>
        </FooterCol>

        <FooterCol title="Learn">
          <FooterLink href="#how">How it works</FooterLink>
          <FooterLink href="#verdicts">Verdict shapes</FooterLink>
          <FooterLink href="#architecture">Architecture</FooterLink>
          <FooterLink href="#compare">vs Solidity</FooterLink>
          <FooterLink href="#faq">FAQ</FooterLink>
        </FooterCol>

        <FooterCol title="On-chain">
          <FooterLink href={explorerUrl()} external>
            Contract
          </FooterLink>
          <FooterLink href="https://github.com/phu1271997/LicenseLogic" external>
            GitHub source
          </FooterLink>
          <FooterLink href="https://studio.genlayer.com" external>
            GenLayer Studio
          </FooterLink>
          <FooterLink href="https://docs.genlayer.com" external>
            GenLayer docs
          </FooterLink>
        </FooterCol>
      </div>

      <div className="gl-divider my-8 max-w-6xl mx-auto" />

      <div className="max-w-6xl mx-auto px-5 flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-[11px] text-[color:var(--foreground-muted)]">
        <div>
          Contract{" "}
          <a href={explorerUrl()} target="_blank" rel="noopener noreferrer" className="font-mono text-[color:var(--accent-2)] hover:underline">
            {shortAddr(CONTRACT_ADDRESS, 10, 8)}
          </a>{" "}
          on GenLayer studionet.
        </div>
        <div>
          Built by <a href="https://github.com/phu1271997" target="_blank" rel="noopener noreferrer" className="text-[color:var(--accent-2)] hover:underline">phu1271997</a>
          {" "}· GenLayer Builder Program.
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-[color:var(--foreground)] mb-3 tracking-widest uppercase">
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function FooterLink({
  href,
  children,
  external,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="block text-xs text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground)] transition-colors"
    >
      {children}
      {external && <span className="opacity-50 ml-1" aria-hidden>↗</span>}
    </a>
  );
}
