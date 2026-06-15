"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { getTransactionsHistory } from "@/lib/api";
import { getDisplayTeamName } from "@/lib/teamName";
import { TransactionsHistoryResponse, TransferHistoryItem } from "@/lib/types";
import { useVisibilityPolling } from "@/lib/useVisibilityPolling";

export default function TransactionsHistoryPage() {
  return (
    <Suspense fallback={<div className="panel panel-body">Loading history...</div>}>
      <TransactionsHistoryContent />
    </Suspense>
  );
}

function formatTransferTime(timestamp: string) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getChipLabel(item: TransferHistoryItem) {
  const note = String(item.note ?? "");
  if (item.chip === "wildcard" || note.startsWith("Wildcard active")) {
    return "Wildcard";
  }

  if (item.chip === "all-star" || note.startsWith("All-Star active")) {
    return "All-Star";
  }

  return "-";
}

function TransactionsHistoryContent() {
  const [data, setData] = useState<TransactionsHistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadedUserIdRef = useRef<string | null>(null);
  const searchParams = useSearchParams();
  const targetUserId = searchParams.get("userId")?.trim() ?? "";

  useVisibilityPolling(async () => {
    try {
      const payload = await getTransactionsHistory(targetUserId || undefined);
      setData(payload);
      loadedUserIdRef.current = targetUserId;
      setError(null);
    } catch (err) {
      if (loadedUserIdRef.current !== targetUserId) {
        setError(err instanceof Error ? err.message : "Failed to load history.");
      } else {
        setError(null);
      }
    }
  }, {
    intervalMs: 30000
  }, [targetUserId]);

  if (!data && !error) {
    return <div className="panel panel-body">Loading history...</div>;
  }

  if (error || !data) {
    return (
      <section className="panel">
        <div className="panel-head">Transaction History</div>
        <div className="panel-body space-y-3 text-sm text-slate-700">
          <p>{error ?? "Please log in first."}</p>
          <Link href="/" className="inline-flex rounded bg-brand-blue px-4 py-2 font-semibold text-white">
            Back To Login
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="panel overflow-hidden">
      <div className="bg-white px-6 py-7">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="text-[2.25rem] font-semibold italic leading-none text-[#111] sm:text-[3rem]">Transaction History</h1>
            <p className="mt-3 text-[1.05rem] text-slate-700">
              {getDisplayTeamName(data.viewer.teamName, data.viewer.managerName)}
            </p>
          </div>
          <Link
            href={{
              pathname: "/points",
              query: {
                userId: data.viewer.userId
              }
            }}
            className="text-sm font-semibold text-[#0a3c98] hover:underline"
          >
            Points
          </Link>
        </div>
      </div>

      <div className="panel-body overflow-x-auto">
        <table className="table-shell">
          <thead>
            <tr>
              <th>Time</th>
              <th>Out</th>
              <th>In</th>
              <th>Card</th>
            </tr>
          </thead>
          <tbody>
            {data.history.length ? (
              data.history.map((item) => (
                <tr key={item.id}>
                  <td>{formatTransferTime(item.timestamp)}</td>
                  <td>{item.outPlayer}</td>
                  <td>{item.inPlayer}</td>
                  <td>{getChipLabel(item)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-sm text-slate-600">
                  No transaction history yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
