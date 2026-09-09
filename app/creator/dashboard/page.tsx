"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { endSession, getUser, hasSession, type EditioUser } from "../../../lib/session";
import styles from "./dashboard.module.css";

const services = [
  { icon: "✦", title: "AI Edit", text: "Fast, smart, scroll-ready.", tone: "light" },
  { icon: "◒", title: "Human Edit", text: "A creative eye on every cut.", tone: "dark" },
  { icon: "⚡", title: "AI + Human", text: "The best of speed + polish.", tone: "lime" },
];

export default function CreatorDashboard() {
  const [user, setUser] = useState<EditioUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(getUser());
    setReady(true);
  }, []);

  if (!ready) return null;

  const name = user?.name?.split(" ")[0] || "Creator";

  return (
    <main className={styles.page}>
      <div className={styles.noise} />
      <header className={styles.nav}>
        <Link className={styles.logo} href="/">EDIT<span>IO</span></Link>
        <div className={styles.navRight}>
          <span className={styles.credit}><b>01</b> free edit credit</span>
          <button className={styles.avatar} aria-label="Account">{name.charAt(0).toUpperCase()}</button>
        </div>
      </header>

      <section className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>CREATOR SPACE <span>●</span></div>
          <h1>Hey {name}.<br /><em>Let&apos;s make<br />something.</em></h1>
          <p>Drop the footage. Pick the vibe. We&apos;ll handle the edit.</p>
        </div>
        <div className={styles.heroOrb}><div className={styles.orbInner}>✦</div><span>YOUR<br />NEXT<br />REEL<br />STARTS<br />HERE.</span></div>
      </section>

      <section className={styles.editSection}>
        <div className={styles.sectionLabel}><span>01</span><div><b>START AN EDIT</b><small>How do you want us to edit?</small></div></div>
        <div className={styles.serviceGrid}>
          {services.map((service) => (
            <Link href="/creator/edit" key={service.title} className={`${styles.service} ${styles[service.tone]}`}>
              <div className={styles.serviceIcon}>{service.icon}</div>
              <div><h2>{service.title}</h2><p>{service.text}</p></div>
              <div className={styles.serviceArrow}>↗</div>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.lowerGrid}>
        <div className={styles.recent}>
          <div className={styles.sectionTop}><div><span>02</span><b>MY EDITS</b></div><Link href="#">View all ↗</Link></div>
          <div className={styles.emptyState}><div className={styles.emptyIcon}>＋</div><h3>Your first Reel is waiting.</h3><p>Nothing here yet. Let&apos;s change that.</p><Link href="/creator/edit" className={styles.startLink}>Start an edit ↗</Link></div>
        </div>
        <aside className={styles.creditCard}>
          <div><span className={styles.smallTag}>EDITIO CREDIT</span><div className={styles.creditBig}>01</div><p>free AI edit credit</p></div>
          <div className={styles.creditBottom}><span>Use it whenever you&apos;re ready.</span><span className={styles.spark}>✦</span></div>
        </aside>
      </section>

      <footer className={styles.footer}><span>CREATE. EDIT. POST.</span><button onClick={() => { endSession(); window.location.href = "/"; }}>Log out ↗</button></footer>
    </main>
  );
}
