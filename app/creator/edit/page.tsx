"use client";

import Link from "next/link";
import { ChangeEvent, DragEvent, useMemo, useState } from "react";
import styles from "./edit.module.css";

type Clip = { id: string; file: File; url: string };

const modes = [
  { id: "ai", icon: "✦", title: "AI Edit", note: "Fast + affordable", text: "Let AI find the best moments, pacing and captions for you." },
  { id: "human", icon: "◒", title: "Human Edit", note: "Personal + creative", text: "A real editor turns your footage into something that feels like you." },
  { id: "both", icon: "⚡", title: "AI + Human", note: "Premium + polished", text: "AI builds the first cut. A human editor gives it the final glow-up." },
];

export default function CreatorEdit() {
  const [mode, setMode] = useState("ai");
  const [step, setStep] = useState(1);
  const [clips, setClips] = useState<Clip[]>([]);
  const [dragging, setDragging] = useState(false);

  const selectedMode = useMemo(() => modes.find(m => m.id === mode)!, [mode]);

  function addFiles(files: FileList | File[]) {
    const incoming = Array.from(files).filter(file => file.type.startsWith("video/"));
    setClips(current => [...current, ...incoming.map(file => ({ id: `${file.name}-${file.size}-${crypto.randomUUID()}`, file, url: URL.createObjectURL(file) }))]);
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) addFiles(event.target.files);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length) addFiles(event.dataTransfer.files);
  }

  function removeClip(id: string) {
    setClips(current => {
      const item = current.find(clip => clip.id === id);
      if (item) URL.revokeObjectURL(item.url);
      return current.filter(clip => clip.id !== id);
    });
  }

  function moveClip(index: number, direction: -1 | 1) {
    setClips(current => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <Link className={styles.logo} href="/creator/dashboard">EDIT<span>IO</span></Link>
        <div className={styles.stepper}><span className={styles.active}>01</span><i /> <span className={step >= 2 ? styles.active : ""}>02</span><i /> <span className={step >= 3 ? styles.active : ""}>03</span></div>
        <Link className={styles.exit} href="/creator/dashboard">Save &amp; exit</Link>
      </header>

      <section className={styles.shell}>
        <div className={styles.heading}><div className={styles.eyebrow}>NEW EDIT / 001</div><h1>Let&apos;s make<br/><em>your Reel.</em></h1><p>{step === 3 ? "Upload the footage. We&apos;ll take it from here." : "First, tell us how much creative energy you want from EDITIO."}</p></div>

        {step === 1 && <div className={styles.modeGrid}>
          {modes.map(item => <button key={item.id} onClick={() => setMode(item.id)} className={`${styles.mode} ${mode === item.id ? styles.selected : ""}`}>
            <div className={styles.modeTop}><span className={styles.modeIcon}>{item.icon}</span><span className={styles.radio}>{mode === item.id ? "●" : "○"}</span></div>
            <div><h2>{item.title}</h2><span className={styles.note}>{item.note}</span><p>{item.text}</p></div>
            <span className={styles.arrow}>↗</span>
          </button>)}
          <button className={styles.continue} onClick={() => setStep(2)}>Continue with {selectedMode.title} <span>↗</span></button>
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

        {step === 3 && <div className={styles.briefCard}>
          <div className={styles.briefHead}><div><div className={styles.eyebrow}>STEP 03 / FOOTAGE</div><h2>Drop your clips.</h2></div><span className={styles.clipCount}>{clips.length} {clips.length === 1 ? "clip" : "clips"}</span></div>
          <label className={`${styles.upload} ${dragging ? styles.uploadDragging : ""}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
            <input type="file" accept="video/mp4,video/quicktime,video/webm,video/*" multiple onChange={onFileChange} />
            <span>＋</span><b>{dragging ? "Drop them here" : "Drop videos here"}</b><small>or click to browse · MP4, MOV, WebM</small>
          </label>
          {clips.length > 0 && <div className={styles.clipList}>
            {clips.map((clip, index) => <div className={styles.clip} key={clip.id}>
              <div className={styles.clipPreview}><video src={clip.url} muted preload="metadata" /></div>
              <div className={styles.clipInfo}><b>{clip.file.name}</b><small>{(clip.file.size / (1024 * 1024)).toFixed(1)} MB · Clip {index + 1}</small></div>
              <div className={styles.clipActions}><button disabled={index === 0} onClick={() => moveClip(index, -1)} aria-label="Move clip up">↑</button><button disabled={index === clips.length - 1} onClick={() => moveClip(index, 1)} aria-label="Move clip down">↓</button><button onClick={() => removeClip(clip.id)} aria-label="Remove clip">×</button></div>
            </div>)}
          </div>}
          <div className={styles.briefActions}><button onClick={() => setStep(2)} className={styles.back}>Back</button><button className={`${styles.continue} ${clips.length === 0 ? styles.disabled : ""}`} disabled={clips.length === 0}>Review &amp; submit <span>↗</span></button></div>
        </div>}
      </section>
    </main>
  );
}
