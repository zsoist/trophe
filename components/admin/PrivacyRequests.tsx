"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, LoaderCircle, ShieldCheck, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface PrivacyRequest {
  id: string;
  request_type: "export" | "deletion" | "correction" | "restriction";
  status: string;
  requested_at: string;
  due_at: string;
  completed_at: string | null;
  result_uri: string | null;
}

export default function PrivacyRequests() {
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const headers = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token)
      throw new Error("Your session expired. Sign in again.");
    return { Authorization: `Bearer ${data.session.access_token}` };
  }, []);

  const loadRequests = useCallback(async () => {
    try {
      const response = await fetch('/api/privacy/requests', {
        headers: await headers(),
      });
      const body = (await response.json()) as {
        requests?: PrivacyRequest[];
        error?: string;
      };
      if (!response.ok)
        throw new Error(body.error ?? "Unable to load privacy requests");
      setRequests(body.requests ?? []);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load privacy requests",
      );
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  async function submit(type: "export" | "deletion") {
    setSubmitting(type);
    setError(null);
    try {
      const response = await fetch('/api/privacy/requests', {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await headers()) },
        body: JSON.stringify({ type }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error ?? "Unable to submit privacy request");
      await loadRequests();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to submit privacy request",
      );
    } finally {
      setSubmitting(null);
    }
  }

  const statusClass = (status: string) => {
    if (status === "completed")
      return "border-[var(--status-success-border)] bg-[var(--status-success-surface)] text-[var(--status-success-fg)]";
    if (status === "rejected" || status === "failed")
      return "border-[var(--status-danger-border)] bg-[var(--status-danger-surface)] text-[var(--status-danger-fg)]";
    return "border-[var(--status-info-border)] bg-[var(--status-info-surface)] text-[var(--status-info-fg)]";
  };

  return (
    <section
      className="mb-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-1)] p-5 shadow-[var(--shadow-low)]"
      aria-labelledby="privacy-controls-title"
    >
      <h3
        id="privacy-controls-title"
        className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--content-primary)]"
      >
        <ShieldCheck size={14} /> Privacy Controls
      </h3>
      <p className="mb-4 text-xs text-[var(--content-secondary)]">
        Request a portable data export or account deletion review. Deletion is verified before processing and is not immediate.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          onClick={() => void submit('export')}
          disabled={Boolean(submitting)}
          className="min-h-11 rounded-xl border border-[var(--border-default)] px-3 text-xs text-[var(--content-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50"
        >
          {submitting === "export" ? (
            <LoaderCircle size={14} className="mx-auto animate-spin" />
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Download size={14} /> Request export
            </span>
          )}
        </button>
        <button
          onClick={() => void submit('deletion')}
          disabled={Boolean(submitting)}
          className="min-h-11 rounded-xl border border-[var(--status-danger-border)] px-3 text-xs text-[var(--status-danger-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50"
        >
          {submitting === "deletion" ? (
            <LoaderCircle size={14} className="mx-auto animate-spin" />
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Trash2 size={14} /> Request deletion
            </span>
          )}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-xs text-[var(--status-danger-fg)]">
          {error}
        </p>
      )}
      {!loading && requests.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-[var(--border-subtle)] pt-3">
          {requests.slice(0, 5).map((request) => (
            <div
              key={request.id}
              className="flex flex-wrap justify-between gap-3 text-xs"
            >
              <span className="capitalize text-[var(--content-secondary)]">
                {request.request_type}
              </span>
              <span
                className={`rounded-full border px-2 py-1 ${statusClass(request.status)}`}
              >
                {request.status} · due{" "}
                {new Date(request.due_at).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
