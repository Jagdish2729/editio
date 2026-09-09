"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { getOrders, updateOrder, type EditOrder } from "../../../../lib/orders";
import styles from "./order.module.css";

const steps = [
  { id: "submitted", label: "Submitted", note: "Your footage and brief are received." },
  { id: "processing", label: "In progress", note: "EDITIO is preparing your first cut." },
  { id: "in_review", label: "Ready for review", note: "Your draft is ready for your feedback." },
  { id: "completed", label: "Final ready", note: "Watch and download your finished Reel." },
] as const;

type PageProps = { params: Promise<{ id: string }> };
type RenderResponse = { ok?: boolean; url?: string; error?: string };

export default function OrderDetail({ params }: PageProps) {
  const { id } = use(params);
  const [order, setOrder] = useState<EditOrder | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState("");
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [savingReview, setSavingReview] = useState(false);

  useEffect(() => {
    const found = getOrders().find((item) => item.id === id) || null;
    setOrder(found);
    setLoaded(true);
  }, [id]);

  async function retryDraft() {
    if (!order || retrying || !order.clipUrls?.length) return;
    setRetrying(true);
    setRetryError("");
    try {
      const clips = order.clipUrls.map((url, index) => ({
        originalName: order.clipNames[index] || `clip-${index + 1}`,
        url,
      }));
      const response = await fetch("/api/render/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, clips, plan: order.aiPlan || { clipSequence: [] } }),
      });
      const data = (await response.json()) as RenderResponse;
      if (!response.ok || !data.url) throw new Error(data.error || "Draft rendering failed.");
      const updated = updateOrder(order.id, {
        status: "in_review",
        renderStatus: "ready",
        draftUrl: data.url,
        aiError: undefined,
      });
      if (updated) setOrder(updated);
    } catch (error) {
      setRetryError(error instanceof Error ? error.message : "Draft rendering failed.");
    } finally {
      setRetrying(false);
    }
  }

  function approveDraft() {
    if (!order?.draftUrl || savingReview) return;
    setSavingReview(true);
    const updated = updateOrder(order.id, {
      status: "completed",
      finalUrl: order.draftUrl,
      revisionNote: undefined,
    });
    if (updated) setOrder(updated);
    setSavingReview(false);
  }

  function requestRevision() {
    if (!order?.draftUrl || savingReview || !revisionNote.trim()) return;
    setSavingReview(true);
    const updated = updateOrder(order.id, {
      status: "revision_requested",
      revisionNote: revisionNote.trim(),
      revisionCount: (order.revisionCount || 0) + 1,
    });
    if (updated) setOrder(updated);
    setRevisionOpen(false);
    setRevisionNote("");
    setSavingReview(false);
  }

  if (!loaded) return null;

  if (!order) {
    return (
      <main className={styles.page}>
        <header className={styles.nav}>
          <Link className={styles.logo} href="/creator/dashboard">EDIT<span>IO</span></Link>
          <Link className={styles.back} href="/creator/dashboard">← My Edits</Link>
        </header>
        <section className={styles.missing}>
          <span>404 / EDIT NOT FOUND</span>
          <h1>This edit<br /><em>isn&apos;t here.</em></h1>
          <Link href="/creator/dashboard" className={styles.primary}>Back to dashboard ↗</Link>
        </section>
      </main>
    );
  }

  const statusForTimeline = order.status === "revision_requested" ? "processing" : order.status;
  const currentIndex = steps.findIndex((step) => step.id === statusForTimeline);
  const statusIndex = currentIndex < 0 ? 0 : currentIndex;
  const isFinal = order.status === "completed" && Boolean(order.finalUrl || order.draftUrl);
  const isReady = Boolean(order.draftUrl) && (order.status === "in_review" || order.status === "revision_requested" || isFinal);
  const isFailed = order.renderStatus === "failed" || order.aiStatus === "failed";
  const failureMessage = retryError || order.aiError || "The first draft could not be generated.";
  const videoUrl = order.finalUrl || order.draftUrl;

  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <Link className={styles.logo} href="/creator/dashboard">EDIT<span>IO</span></Link>
        <div className={styles.navCenter}>EDIT / {order.id}</div>
        <Link className={styles.back} href="/creator/dashboard">← My Edits</Link>
      </header>

      <section className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>YOUR EDIT / {order.id}</div>
          <h1>{isFinal ? <>Your Reel is<br /><em>finished.</em></> : isReady ? <>Your draft is<br /><em>ready.</em></> : <>{order.modeLabel}<br /><em>is in the works.</em></>}</h1>
          <p>{isFinal ? "Your final Reel is ready. Watch it below or download the finished file." : isReady ? "Your first cut is ready. Watch it below and decide what you want to change before final approval." : "Everything about this request lives here. When your draft is ready, this is where you&apos;ll watch it."}</p>
        </div>
        <div className={styles.statusCard}>
          <span>STATUS</span>
          <strong>{isFinal ? "Final ready" : order.status === "revision_requested" ? "Revision requested" : isReady ? "Ready for review" : steps[statusIndex].label}</strong>
          <small>{isFinal ? "Your finished Reel is ready to download." : order.status === "revision_requested" ? "Your feedback is saved. EDITIO will use it for the next cut." : isFailed ? "Something needs attention. You can retry the draft below." : isReady ? "Your first-cut Reel is ready to watch." : steps[statusIndex].note}</small>
        </div>
      </section>

      <section className={styles.content}>
        <div className={styles.timelineCard}>
          <div className={styles.cardHead}>
            <div><span>01</span><b>EDIT PROGRESS</b></div>
            <span>{isFinal ? "100%" : `${Math.round((statusIndex / (steps.length - 1)) * 100)}%`}</span>
          </div>
          <div className={styles.timeline}>
            {steps.map((step, index) => (
              <div className={`${styles.timelineStep} ${index <= statusIndex || isFinal ? styles.done : ""} ${index === statusIndex && !isFinal ? styles.current : ""}`} key={step.id}>
                <div className={styles.dot}>{index < statusIndex || isFinal ? "✓" : index === statusIndex ? "●" : index + 1}</div>
                <div><strong>{step.label}</strong><small>{step.note}</small></div>
              </div>
            ))}
          </div>
          {order.status === "revision_requested" && (
            <div className={styles.revisionSaved}>
              <b>REVISION NOTE SAVED</b>
              <p>“{order.revisionNote}”</p>
              <small>We&apos;ll use this feedback for the next cut.</small>
            </div>
          )}
          {isFailed && (
            <div className={styles.failureBox}>
              <div className={styles.failureNote}>Draft generation hit an error. Your uploaded footage and order are still safe.</div>
              <details className={styles.errorDetails}><summary>Show technical detail</summary><pre>{failureMessage}</pre></details>
              <button className={styles.retryButton} onClick={retryDraft} disabled={retrying}>{retrying ? "RENDERING YOUR DRAFT…" : "RETRY DRAFT ↗"}</button>
            </div>
          )}
        </div>

        <div className={`${styles.previewCard} ${isReady ? styles.previewReady : ""}`}>
          <div className={styles.previewTop}><span>02 / REEL PREVIEW</span><span>{isFinal ? "FINAL READY" : isReady ? "DRAFT READY" : "COMING NEXT"}</span></div>
          <div className={styles.previewStage}>
            {isReady && videoUrl ? <video className={styles.reelPlayer} src={videoUrl} controls playsInline preload="metadata" /> : <><div className={styles.playMark}>✦</div><div className={styles.previewText}>YOUR REEL WILL APPEAR HERE</div><small>No edited video has been generated yet.</small></>}
          </div>
          <div className={styles.previewActions}>
            <button disabled={!isReady}>{isFinal ? "Watch final" : "Watch draft"}<span>▶</span></button>
            <a className={isReady && videoUrl ? styles.downloadLink : styles.disabledLink} href={isReady && videoUrl ? videoUrl : "#"} download={isReady && videoUrl ? `${order.id}-${isFinal ? "final" : "draft"}.mp4` : undefined}>{isFinal ? "Download final" : "Download draft"} <span>↓</span></a>
          </div>
          {isReady && !isFinal && (
            <div className={styles.reviewPanel}>
              <div><b>YOUR DRAFT IS READY</b><p>Watch the cut once. If it feels right, approve it. If something needs changing, tell EDITIO exactly what to fix.</p></div>
              <div className={styles.reviewButtons}>
                <button className={styles.revisionButton} onClick={() => setRevisionOpen((value) => !value)}>Request revision</button>
                <button className={styles.approveButton} onClick={approveDraft} disabled={savingReview}>{savingReview ? "SAVING…" : "Approve final ✓"}</button>
              </div>
              {revisionOpen && (
                <div className={styles.revisionForm}>
                  <label>What should we change?
                    <textarea value={revisionNote} onChange={(event) => setRevisionNote(event.target.value)} placeholder="e.g. Make the opening faster, remove the second clip, change the hook..." />
                    <div><button className={styles.cancelButton} onClick={() => setRevisionOpen(false)}>Cancel</button><button className={styles.sendRevisionButton} disabled={!revisionNote.trim() || savingReview} onClick={requestRevision}>Send revision ↗</button></div>
                  </label>
                </div>
              )}
            </div>
          )}
        </div>

        <div className={styles.detailsCard}>
          <div className={styles.cardHead}><div><span>03</span><b>ORDER DETAILS</b></div><Link href="/creator/edit">Start another ↗</Link></div>
          <div className={styles.detailGrid}>
            <div><small>EDIT TYPE</small><strong>{order.modeLabel}</strong></div>
            <div><small>FORMAT</small><strong>{order.format}</strong></div>
            <div><small>VIBE</small><strong>{order.vibe}</strong></div>
            <div><small>FOOTAGE</small><strong>{order.clipCount} {order.clipCount === 1 ? "clip" : "clips"}</strong></div>
            <div><small>HOOK</small><strong>{order.includeHook === false ? "No" : "Yes"}</strong></div>
            <div><small>CAPTIONS</small><strong>{order.includeCaptions === false ? "No" : "Yes"}</strong></div>
            <div className={styles.full}><small>BRIEF</small><p>{order.brief || "No extra instructions added."}</p></div>
          </div>
        </div>
      </section>
    </main>
  );
}
