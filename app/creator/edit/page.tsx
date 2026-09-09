"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./edit.module.css";

const modes = [
  { id: "ai", icon: "✦", title: "AI Edit", note: "Fast + affordable", text: "Let AI find the best moments, pacing and captions for you." },
  { id: "human", icon: "◒", title: "Human Edit", note: "Personal + creative", text: "A real editor turns your footage into something that feels like you." },
  { id: "both", icon: "⚡", title: "AI + Human", note: "Premium + polished", text: "AI builds the first cut. A human editor gives it the final glow-up." },
];

export default function CreatorEdit() {
  const [mode, setMode] = useState("ai");
  const [step, setStep] = useState(1);

  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <Link className={styles.logo} href="/creator/dashboard">EDIT<span>IO</span></Link>
        <div className={styles.stepper}><span className={styles.active}>01</span><i /> <span className={step >= 2 ? styles.active : ""}>02</span><i /> <span>03</span></div>
        <Link className={styles.exit} href="/creator/dashboard">Save &amp; exit</Link>
      </header>

      <section className={styles.shell}>
        <div className={styles.heading}><div className={styles.eyebrow}>NEW EDIT / 001</div><h1>Let&apos;s make<br/><em>your Reel.</em></h1><p>First, tell us how much creative energy you want from EDITIO.</p></div>

        {step === 1 && <div className={styles.modeGrid}>
          {modes.map(item => <button key={item.id} onClick={() => setMode(item.id)} className={`${styles.mode} ${mode === item.id ? styles.selected : ""}`}>
            <div className={styles.modeTop}><span className={styles.modeIcon}>{item.icon}</span><span className={styles.radio}>{mode === item.id ? "●" : "○"}</span></div>
            <div><h2>{item.title}</h2><span className={styles.note}>{item.note}</span><p>{item.text}</p></div>
            <span className={styles.arrow}>↗</span>
          </button>)}
          <button className={styles.continue} onClick={() => setStep(2)}>Continue with {modes.find(m => m.id === mode)?.title} <span>↗</span></button>
        </div>}

        {step === 2 && <div className={styles.briefCard}>
          <div className={styles.briefHead}><div><div className={styles.eyebrow}>STEP 02 / YOUR BRIEF</div><h2>Give us the vibe.</h2></div><button onClick={() => setStep(1)}>← Change edit type</button></div>
          <div className={styles.fields}>
            <label>What are you making?<select defaultValue="reel"><option value="reel">Instagram Reel</option><option value="short">YouTube Short</option><option value="other">Other short-form video</option></select></label>
            <label>What&apos;s the vibe?<select defaultValue="fast"><option value="fast">Fast &amp; punchy</option><option value="clean">Clean &amp; minimal</option><option value="cinematic">Cinematic</option><option value="fun">Fun &amp; chaotic</option></select></label>
            <label className={styles.full}>Tell us what you want<input placeholder="e.g. Keep the funny moments, quick cuts, bold captions, trending feel..." /></label>
            <label className={styles.full}>Reference Reel <div className={styles.reference}><span>＋</span><div><b>Paste a Reel / TikTok / Shorts link</b><small>Optional — helps us understand your taste.</small></div></div></label>
          </div>
          <div className={styles.briefActions}><button onClick={() => setStep(1)} className={styles.back}>Back</button><button className={styles.continue} onClick={() => setStep(3)}>Next: Upload clips <span>↗</span></button></div>
        </div>}

        {step === 3 && <div className={styles.briefCard}><div className={styles.briefHead}><div><div className={styles.eyebrow}>STEP 03 / FOOTAGE</div><h2>Drop your clips.</h2></div></div><label className={styles.upload}><input type="file" accept="video/*" multiple /><span>＋</span><b>Drop videos here</b><small>or click to browse · MP4, MOV, WebM</small></label><div className={styles.briefActions}><button onClick={() => setStep(2)} className={styles.back}>Back</button><button className={styles.continue}>Review &amp; submit <span>↗</span></button></div></div>}
      </section>
    </main>
  );
}
