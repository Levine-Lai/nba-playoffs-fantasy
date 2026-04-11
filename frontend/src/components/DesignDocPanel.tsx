"use client";

import { useEffect, useMemo, useState } from "react";
import { designDocs } from "@/data/designDocs";

interface DesignDocPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width?: number;
}

function renderDoc(content: string) {
  const lines = content.split("\n");
  const nodes: JSX.Element[] = [];
  let listBuffer: string[] = [];

  const flushList = () => {
    if (!listBuffer.length) {
      return;
    }

    nodes.push(
      <ul key={`list-${nodes.length}`} className="mb-3 ml-5 list-disc text-sm leading-6 text-slate-700">
        {listBuffer.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
    );

    listBuffer = [];
  };

  lines.forEach((line, index) => {
    if (line.startsWith("- ")) {
      listBuffer.push(line.slice(2));
      return;
    }

    flushList();

    if (line.startsWith("# ")) {
      nodes.push(
        <h1 key={`h1-${index}`} className="mb-3 text-xl font-semibold text-slate-900">
          {line.slice(2)}
        </h1>
      );
      return;
    }

    if (line.startsWith("## ")) {
      nodes.push(
        <h2 key={`h2-${index}`} className="mb-2 mt-4 text-base font-semibold text-slate-900">
          {line.slice(3)}
        </h2>
      );
      return;
    }

    if (line.trim() === "") {
      nodes.push(<div key={`sp-${index}`} className="h-2" />);
      return;
    }

    nodes.push(
      <p key={`p-${index}`} className="mb-2 text-sm leading-6 text-slate-700">
        {line}
      </p>
    );
  });

  flushList();
  return nodes;
}

export default function DesignDocPanel({ open, onOpenChange, width = 420 }: DesignDocPanelProps) {
  const [activeId, setActiveId] = useState(designDocs[0]?.id ?? "");
  const [copied, setCopied] = useState(false);

  const activeDoc = useMemo(
    () => designDocs.find((item) => item.id === activeId) ?? designDocs[0],
    [activeId]
  );

  useEffect(() => {
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };

    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onOpenChange]);

  async function onCopy() {
    if (!activeDoc) {
      return;
    }

    await navigator.clipboard.writeText(activeDoc.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="fixed bottom-6 right-6 z-40 rounded-full bg-brand-darkBlue px-4 py-2 text-sm font-semibold text-white shadow-lg"
      >
        Design Docs {designDocs.length}
      </button>

      <aside
        className="fixed right-0 top-[150px] z-30 h-[calc(100vh-150px)] border-l border-slate-300 bg-white shadow-panel transition-transform duration-300"
        style={{ width, transform: open ? "translateX(0)" : `translateX(${width}px)` }}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">Design Documentation</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCopy}
              className={`rounded px-3 py-1 text-xs font-semibold ${
                copied ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"
              }`}
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700"
            >
              Close
            </button>
          </div>
        </header>

        <div className="border-b border-slate-200 px-2 py-2">
          <div className="flex gap-2 overflow-x-auto">
            {designDocs.map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => setActiveId(doc.id)}
                className={`shrink-0 rounded-t px-3 py-1 text-xs font-semibold ${
                  doc.id === activeDoc?.id
                    ? "border-b-2 border-brand-blue text-brand-blue"
                    : "text-slate-500"
                }`}
              >
                {doc.title}
              </button>
            ))}
          </div>
        </div>

        <div className="h-[calc(100%-92px)] overflow-y-auto px-4 py-4">{activeDoc ? renderDoc(activeDoc.content) : null}</div>
      </aside>
    </>
  );
}
