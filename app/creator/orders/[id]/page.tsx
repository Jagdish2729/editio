"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getOrders, type EditOrder } from "../../../../lib/orders";
import styles from "./order.module.css";

const steps = [
  { id: "submitted", label: "Submitted", note: "Your footage and brief are received." },
  { id: "processing", label: "In progress", note: "EDITIO is preparing your first cut." },
  { id: "in_review", label: "Ready for review", note: "Your draft will appear here when ready." },
  { id: "completed", label: "Final ready", note: "Watch and download your finished Reel." },
] as const;

export default function OrderDetail({ params }: { params: { id: string } }) {
  const [order, setOrder] = useState<EditOrder | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setOrder(getOrders().find(item => item.id === params.id) || null);
    setLoaded(true);
  }, [params.id]);

  if (!loaded) return null;

  if (!order) {
    return (
      <main className={styles.page}>
        <header className={styles.nav}><Link className={styles.logo} href="/creator/dashboard">EDIT<span>IO</span></Link><Link className={styles.back} href="/creator/dashboard">← My Edits</Link></header>
        <section className={styles.missing}><span>404 / EDIT NOT FOUND</span><h1>This edit<br/><em>isn't here.</em></h1><Link href="/creator/dashboard" className={styles.primary}>Back to dashboard ↗</Link></section>
      </main>
    );
  }

  const currentIndex = steps.findIndex(step => step.id === order.status);
  const statusIndex = currentIndex < 0 ? 0 : currentIndex;
  const isReady = order.status === "in_review" || order.status === "completed";

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
          <h1>{order.modeLabel}<br/><em>is in the works.</em></h1>
          <p>Everything about this request lives here. When your draft is ready, this is where you&apos;ll watch it.</p>
        </div>
        <div className={styles.statusCard}>
          <span>STATUS</span>
          <strong>{steps[statusIndex].label}</strong>
          <small>{steps[statusIndex].note}</small>
        </div>
      </section>

      <section className={styles.content}>
        <div className={styles.timelineCard}>
          <div className={styles.cardHead}><div><span>01</span><b>EDIT PROGRESS</b></div><span>{Math.round((statusIndex / (steps.length - 1)) * 100)}%</span></div>
          <div className={styles.timeline}>
            {steps.map((step, index) => (
              <div className={`${styles.timelineStep} ${index <= statusIndex ? styles.done : ""} ${index === statusIndex ? styles.current : ""}`} key={step.id}>
                <div className={styles.dot}>{index < statusIndex ? "✓" : index === statusIndex ? "●" : index + 1}</div>
                <div><strong>{step.label}</strong><small>{step.note}</small></div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.previewCard}>
          <div className={styles.previewTop}><span>02 / REEL PREVIEW</span><span>{isReady ? "READY" : "COMING NEXT"}</span></div>
          <div className={styles.previewStage}>
            <div className={styles.playMark}>{isReady ? "▶" : "✦"}</div>
            <div className={styles.previewText}>{isReady ? "YOUR DRAFT IS READY" : "YOUR REEL WILL APPEAR HERE"}</div>
            <small>{isReady ? "Preview your edit before approving the final." : "No edited video has been generated yet."}</small>
          </div>
          <div className={styles.previewActions}>
            <button disabled={!isReady}>{order.status === "completed" ? "Watch final reel" : "Watch draft"} <span>▶</span></button>
            <button disabled={order.status !== "completed"}>Download <span>↓</span></button>
          </div>
        </div>

        <div className={styles.detailsCard}>
          <div className={styles.cardHead}><div><span>03</span><b>ORDER DETAILS</b></div><Link href="/creator/edit">Start another ↗</Link></div>
          <div className={styles.detailGrid}>
            <div><small>EDIT TYPE</small><strong>{order.modeLabel}</strong></div>
            <div><small>FORMAT</small><strong>{order.format}</strong></div>
            <div><small>VIBE</small><strong>{order.vibe}</strong></div>
            <div><small>FOOTAGE</small><strong>{order.clipCount} {order.clipCount === 1 ? "clip" : "clips"}</strong></div>
            <div className={styles.full}><small>BRIEF</small><p>{order.brief || "No extra instructions added."}</p></div>
          </div>
        </div>
      </section>
    </main>
  );
}
