"use client";

import Link from "next/link";
import { ChangeEvent, DragEvent, useMemo, useState } from "react";
import { createOrder, updateOrder } from "../../../lib/orders";
import { extractVideoFrames, type VideoFrame } from "../../../lib/video-analysis";
import { consumeFreeAiCredit, hasFreeAiCredit } from "../../../lib/session";
import styles from "./edit.module.css";

type Clip = { id: string; file: File; url: string };
const modes = [
  { id: "ai" as const, icon: "✦", title: "AI Edit", note: "Fast + affordable", text: "Let AI find the best moments, pacing and cuts for you." },
  { id: "human" as const, icon: "◒", title: "Human Edit", note: "Personal + creative", text: "A real editor turns your footage into something that feels like you." },
  { id: "both" as const, icon: "⚡", title: "AI + Human", note: "Premium + polished", text: "AI builds the first cut. A human editor gives it the final glow-up." },
];
const categoryGuides: Record<string, string> = {
  Cricket: "Create a high-energy cricket Reel around the REAL main event in the footage. AI must inspect all frames and decide the hero moment itself; the creator does not need to identify it. If an actual wicket, dismissal, catch, boundary or decisive result is visible, that event MUST be shown and treated as the hero — never replace the play with only a reaction or celebration. Build setup → delivery/action → result → reaction when supported. Keep the wicket-taking action understandable by preserving bowler + batsman + pitch/wicket/ball context whenever the source framing allows it. Use tight cuts, selective slow motion and subtle reframing only when they improve understanding. Remove phone UI, dead time, duplicates and accidental tails. Preserve natural source audio. Never invent scores, wickets, shots, players, dialogue or events that are not supported by the footage.",
  Fashion: "Create a stylish fashion Reel. AI should identify the strongest real hero moment from the footage, then build around it with outfit reveal, movement, detail and confident final frame when supported. Remove awkward pauses, duplicate angles, empty frames and phone UI. Keep pacing polished and visual. Do not invent clothing details or actions that are not visible.",
  Travel: "Create an immersive travel Reel. AI should identify the strongest real experience/hero moment from the footage, then build a visual journey around it using establishing shots, movement, location details and a memorable ending when supported. Remove dead walking time, shaky/empty frames, duplicates and phone UI. Never invent a place, activity or experience not visible.",
  Food: "Create an appetizing food Reel. AI should identify the strongest real food hero moment, then build around preparation/action, texture/detail, reveal and final hero shot when supported. Keep cuts tight, remove dead time and duplicate frames, and end on the most satisfying real food visual. Never claim ingredients, taste or preparation steps that are not visible.",
  Fitness: "Create a motivating fitness Reel. AI should identify the strongest real movement/effort/result as the hero, then build setup → action → payoff. Remove rest/dead time and repetitive frames, and finish on a strong result or reaction. Never invent exercises, reps, results or claims not visible.",
  Beauty: "Create a polished beauty Reel. AI should identify the strongest real transformation/final-look moment, then build around before/application/action/detail/final look when supported. Use clean pacing, remove dead time and duplicates, and end on the strongest finished look. Never invent products, results or techniques not visible.",
  Lifestyle: "Create a modern lifestyle Reel. AI should identify the strongest real moment/payoff and build a natural mini-story around it with a strong opening, varied shots and a satisfying ending. Remove dead space, repetitive visuals and phone UI. Keep the edit authentic to what is visible.",
  Gaming: "Create an energetic gaming Reel. AI should identify the strongest real gameplay payoff, clutch, win/fail or reaction moment, then build tension toward it. Remove menu screens, dead time and repetitive gameplay, and finish on a clear payoff. Never invent game events or outcomes.",
  Business: "Create a sharp business/creator Reel. AI should identify the strongest real useful/action/work/product payoff and build the story around it. Remove pauses, repetition, empty frames and phone UI. Keep the story concise and credible. Never invent claims, results, quotes or facts.",
  Other: "Describe the style, story or feeling you want. AI will still inspect the footage itself and decide the strongest real main moment/payoff rather than requiring you to identify it. Mention any must-keep moments, pacing, opening, ending, things to remove and specific creative direction."
};
const categories = Object.keys(categoryGuides);
type UploadResponse = { ok?: boolean; error?: string; files?: Array<{ originalName: string; url: string }> };
type AIResponse = { ok?: boolean; error?: string; plan?: unknown };
type RenderResponse = { ok?: boolean; error?: string; url?: string };

export default function CreatorEdit() {
  const [mode, setMode] = useState<"ai" | "human" | "both">("ai");
  const [step, setStep] = useState(1); const [clips, setClips] = useState<Clip[]>([]); const [dragging, setDragging] = useState(false);
  const [format, setFormat] = useState("Instagram Reel"); const [vibe, setVibe] = useState("Fast & punchy"); const [category, setCategory] = useState("Cricket");
  const [creativeDirection, setCreativeDirection] = useState(categoryGuides.Cricket); const [hookEnabled, setHookEnabled] = useState(true); const [hookText, setHookText] = useState(""); const [reference, setReference] = useState("");
  const [submitted, setSubmitted] = useState(false); const [orderId, setOrderId] = useState(""); const [uploading, setUploading] = useState(false); const [retrying, setRetrying] = useState(false); const [error, setError] = useState("");
  const [aiResult, setAiResult] = useState<"ready" | "failed" | "not_started">("not_started"); const [renderResult, setRenderResult] = useState<"ready" | "failed" | "not_started">("not_started");
  const [retryUsed, setRetryUsed] = useState(false); const [uploadedClips, setUploadedClips] = useState<Array<{ originalName: string; url: string }>>([]); const [frames, setFrames] = useState<VideoFrame[]>([]);
  const selectedMode = useMemo(() => modes.find(m => m.id === mode)!, [mode]);

  function addFiles(files: FileList | File[]) { const incoming = Array.from(files).filter(f => f.type.startsWith("video/")); setClips(c => [...c, ...incoming.map(file => ({ id: `${file.name}-${file.size}-${crypto.randomUUID()}`, file, url: URL.createObjectURL(file) }))]); }
  function onFileChange(e: ChangeEvent<HTMLInputElement>) { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }
  function onDrop(e: DragEvent<HTMLLabelElement>) { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }
  function removeClip(id: string) { setClips(c => { const x = c.find(v => v.id === id); if (x) URL.revokeObjectURL(x.url); return c.filter(v => v.id !== id); }); }
  function moveClip(i: number, d: -1 | 1) { setClips(c => { const t = i + d; if (t < 0 || t >= c.length) return c; const n = [...c]; [n[i], n[t]] = [n[t], n[i]]; return n; }); }
  function selectCategory(value: string) { setCategory(value); setCreativeDirection(categoryGuides[value]); }
  function goToUpload() { if (hookEnabled && !hookText.trim()) { setError("Tell us what hook you want, or choose No Hook."); return; } if (!creativeDirection.trim()) { setError("Describe how you want your Reel edited."); return; } setError(""); setStep(3); }

  async function runAi(order: string, uploaded: Array<{ originalName: string; url: string }>, frameData: VideoFrame[]) {
    const aiResponse = await fetch("/api/ai/analyze-v2", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order, editType: selectedMode.title, format, vibe, category, creativeDirection: creativeDirection.trim(), hookEnabled, hookText: hookText.trim(), reference: reference.trim(), frames: frameData }) });
    const aiData = await aiResponse.json() as AIResponse;
    if (!aiResponse.ok || !aiData.plan) throw new Error(aiData.error || "AI footage analysis failed.");
    updateOrder(order, { status: "processing", aiStatus: "ready", aiPlan: aiData.plan as never, renderStatus: "rendering" }); setAiResult("ready");
    const renderResponse = await fetch("/api/render/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order, clips: uploaded, plan: aiData.plan }) });
    const renderData = await renderResponse.json() as RenderResponse;
    if (!renderResponse.ok || !renderData.url) throw new Error(renderData.error || "AI draft rendering failed.");
    updateOrder(order, { status: "in_review", renderStatus: "ready", draftUrl: renderData.url }); setRenderResult("ready");
  }

  async function submitOrder() {
    if (!clips.length || uploading) return;
    if (mode !== "human" && !hasFreeAiCredit()) { setError("Your free AI Reel has already been used. Buy an AI edit credit to create another Reel."); return; }
    setError(""); setUploading(true); setAiResult("not_started"); setRenderResult("not_started");
    try {
      const formData = new FormData(); clips.forEach(c => formData.append("files", c.file, c.file.name));
      const uploadResponse = await fetch("/api/uploads", { method: "POST", body: formData }); const uploadData = await uploadResponse.json() as UploadResponse;
      if (!uploadResponse.ok || !uploadData.files?.length) throw new Error(uploadData.error || "Could not upload your footage.");
      const uploaded = uploadData.files.map(file => ({ originalName: file.originalName, url: file.url })); const clipUrls = uploaded.map(file => file.url); const clipNames = uploaded.map(file => file.originalName);
      const order = createOrder({ mode, modeLabel: selectedMode.title, format, vibe, category, creativeDirection: creativeDirection.trim(), hookEnabled, hookText: hookText.trim(), brief: creativeDirection.trim(), includeHook: hookEnabled, reference: reference.trim(), clipNames, clipUrls, clipCount: clipUrls.length, aiStatus: mode === "human" ? "not_started" : "queued", renderStatus: mode === "human" ? "not_started" : "rendering" });
      if (!order) throw new Error("Could not create the edit order.");
      setOrderId(order.id); setUploadedClips(uploaded);
      if (mode !== "human") {
        consumeFreeAiCredit();
        try {
          const frameData: VideoFrame[] = []; for (const clip of clips) frameData.push(...await extractVideoFrames(clip.file.name, clip.url));
          if (!frameData.length) throw new Error("Could not read frames from your footage.");
          setFrames(frameData); await runAi(order.id, uploaded, frameData);
        } catch (e) {
          const message = e instanceof Error ? e.message : "AI editing failed.";
          updateOrder(order.id, { status: "processing", aiStatus: "failed", renderStatus: "failed", aiError: message }); setAiResult("failed"); setRenderResult("failed"); setError(message);
        }
      }
      setSubmitted(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong. Please try again."); }
    finally { setUploading(false); }
  }

  async function retryAi() {
    if (retrying || retryUsed || mode === "human" || !orderId || !frames.length || !uploadedClips.length) return;
    setRetryUsed(true); setRetrying(true); setError(""); setAiResult("not_started"); setRenderResult("not_started");
    try { await runAi(orderId, uploadedClips, frames); }
    catch (e) { const message = e instanceof Error ? e.message : "AI retry failed."; updateOrder(orderId, { status: "processing", renderStatus: "failed", aiError: message }); setRenderResult("failed"); setError(message); }
    finally { setRetrying(false); }
  }

  if (submitted) return <main className={styles.page}><header className={styles.nav}><Link className={styles.logo} href="/creator/dashboard">EDIT<span>IO</span></Link><span className={styles.successTag}>ORDER RECEIVED ✦</span><Link className={styles.exit} href={`/creator/orders/${orderId}`}>Open my edit ↗</Link></header><section className={styles.successShell}><div className={styles.successBadge}>{renderResult === "ready" ? "✦ YOUR DRAFT IS READY" : mode === "human" ? "✦ YOU'RE IN THE QUEUE" : aiResult === "ready" ? "✦ AI PLAN READY" : "✦ EDITIO NEEDS A RETRY"}</div><h1>{renderResult === "ready" ? <>Your Reel is<br/><em>ready.</em></> : <>We've got<br/><em>your Reel.</em></>}</h1><p>{renderResult === "ready" ? "EDITIO created a first-cut draft from your footage and creative brief. Open your edit to watch it." : mode === "human" ? "Your footage is uploaded and your request is safely queued for a human editor." : aiResult === "ready" ? "The AI plan is ready, but the draft renderer needs another attempt. Your footage is safe." : "Your footage was uploaded, but the AI analysis needs another attempt."}</p>{error && <div className={styles.submitError}>{error}</div>}<div className={styles.orderCard}><div><span>ORDER</span><strong>{orderId}</strong></div><div><span>EDIT TYPE</span><b>{selectedMode.title}</b></div><div><span>{renderResult === "failed" ? "DRAFT" : "AI PLANNER"}</span><b className={renderResult === "failed" ? styles.statusPillMuted : styles.statusPill}>{renderResult === "ready" ? "Ready to watch" : mode === "human" ? "Not needed" : aiResult === "ready" ? "Plan ready" : "Needs attention"}</b></div></div>{renderResult === "failed" && mode !== "human" && !retryUsed && <button className={styles.successButton} onClick={retryAi} disabled={retrying}>{retrying ? "Retrying AI…" : "Retry AI — 1 retry left"}<span>↻</span></button>}<Link href={`/creator/orders/${orderId}`} className={styles.successButton}>{renderResult === "ready" ? "Watch my draft" : "Open my edit"}<span>↗</span></Link></section></main>;

  return <main className={styles.page}><header className={styles.nav}><Link className={styles.logo} href="/creator/dashboard">EDIT<span>IO</span></Link><div className={styles.stepper}><span className={step >= 1 ? styles.active : ""}>01</span><i/><span className={step >= 2 ? styles.active : ""}>02</span><i/><span className={step >= 3 ? styles.active : ""}>03</span><i/><span className={step >= 4 ? styles.active : ""}>04</span></div><Link className={styles.exit} href="/creator/dashboard">Save &amp; exit</Link></header><section className={styles.shell}><div className={styles.heading}><div className={styles.eyebrow}>NEW EDIT / 001</div><h1>Let's make<br/><em>your Reel.</em></h1><p>{step === 3 ? "Upload the footage. We'll study the actual frames and take it from there." : step === 4 ? "One last look before we put your edit in motion." : "Tell EDITIO what you're making and how you want it edited."}</p></div>
  {step === 1 && <div className={styles.modeGrid}>{modes.map(item => <button key={item.id} onClick={() => setMode(item.id)} className={`${styles.mode} ${mode === item.id ? styles.selected : ""}`}><div className={styles.modeTop}><span className={styles.modeIcon}>{item.icon}</span><span className={styles.radio}>{mode === item.id ? "●" : "○"}</span></div><div><h2>{item.title}</h2><span className={styles.note}>{item.note}</span><p>{item.text}</p></div><span className={styles.arrow}>↗</span></button>)}<button className={styles.continue} onClick={() => { if (mode !== "human" && !hasFreeAiCredit()) { setError("Your free AI Reel has already been used. Buy an AI edit credit to create another Reel."); return; } setError(""); setStep(2); }}>Continue with {selectedMode.title}<span>↗</span></button>{error && <div className={styles.submitError}>{error}</div>}</div>}
  {step === 2 && <div className={styles.briefCard}><div className={styles.briefHead}><div><div className={styles.eyebrow}>STEP 02 / YOUR CREATIVE BRIEF</div><h2>What are we making?</h2></div><button onClick={() => setStep(1)}>← Change edit type</button></div><div className={styles.fields}>
    <label>Reel type<select value={category} onChange={e => selectCategory(e.target.value)}>{categories.map(item => <option key={item}>{item}</option>)}</select></label>
    <label>What's the vibe?<select value={vibe} onChange={e => setVibe(e.target.value)}><option>Fast &amp; punchy</option><option>Clean &amp; minimal</option><option>Cinematic</option><option>Fun &amp; chaotic</option></select></label>
    <label>What are you making?<select value={format} onChange={e => setFormat(e.target.value)}><option>Instagram Reel</option><option>YouTube Short</option><option>Other short-form video</option></select></label>
    <label>Opening hook?<select value={hookEnabled ? "yes" : "no"} onChange={e => { const enabled = e.target.value === "yes"; setHookEnabled(enabled); if (!enabled) setHookText(""); }}><option value="yes">Yes — use my hook</option><option value="no">No — keep it clean</option></select></label>
    {hookEnabled && <label className={styles.full}>What should the hook say?<input value={hookText} onChange={e => setHookText(e.target.value)} placeholder="e.g. Wait for the last ball…" maxLength={90}/></label>}
    <label className={styles.full}>Editing direction <span style={{ opacity: 0.55 }}>(AI decides the main moment)</span><textarea value={creativeDirection} onChange={e => setCreativeDirection(e.target.value)} placeholder="Tell EDITIO the style, pacing, must-keep moments, things to remove and what matters most."/></label>
    <label className={styles.full}>Reference Reel<input value={reference} onChange={e => setReference(e.target.value)} placeholder="Paste a Reel / TikTok / Shorts link (optional)"/></label>
    <div className={styles.full} style={{ opacity: 0.62, fontSize: "0.82rem", lineHeight: 1.5 }}>You don't need to tell EDITIO what the main moment is. Once you upload the footage, AI will inspect the actual frames, find the strongest real event/payoff, decide the clip order and build the edit around it.</div>
  </div>{error && <div className={styles.submitError}>{error}</div>}<div className={styles.briefActions}><button onClick={() => setStep(1)} className={styles.back}>Back</button><button className={styles.continue} onClick={goToUpload}>Next: Upload clips<span>↗</span></button></div></div>}
  {step === 3 && <div className={styles.briefCard}><div className={styles.briefHead}><div><div className={styles.eyebrow}>STEP 03 / FOOTAGE</div><h2>Drop your clips.</h2></div><span className={styles.clipCount}>{clips.length} {clips.length === 1 ? "clip" : "clips"}</span></div><label className={`${styles.upload} ${dragging ? styles.uploadDragging : ""}`} onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}><input type="file" accept="video/mp4,video/quicktime,video/webm,video/*" multiple onChange={onFileChange}/><span>＋</span><b>{dragging ? "Drop them here" : "Drop videos here"}</b><small>or click to browse · MP4, MOV, WebM</small></label>{clips.length > 0 && <div className={styles.clipList}>{clips.map((clip, index) => <div className={styles.clip} key={clip.id}><div className={styles.clipPreview}><video src={clip.url} muted preload="metadata"/></div><div className={styles.clipInfo}><b>{clip.file.name}</b><small>{(clip.file.size / (1024 * 1024)).toFixed(1)} MB · Clip {index + 1}</small></div><div className={styles.clipActions}><button disabled={index === 0} onClick={() => moveClip(index, -1)}>↑</button><button disabled={index === clips.length - 1} onClick={() => moveClip(index, 1)}>↓</button><button onClick={() => removeClip(clip.id)}>×</button></div></div>)}</div>}<div className={styles.briefActions}><button onClick={() => setStep(2)} className={styles.back}>Back</button><button className={`${styles.continue} ${clips.length === 0 ? styles.disabled : ""}`} disabled={!clips.length} onClick={() => setStep(4)}>Review order<span>↗</span></button></div></div>}
  {step === 4 && <div className={styles.reviewCard}><div className={styles.reviewHeader}><div><div className={styles.eyebrow}>STEP 04 / FINAL CHECK</div><h2>Looks good?</h2></div><span className={styles.readyPill}>READY TO EDIT ✦</span></div><div className={styles.reviewGrid}><div className={styles.reviewMode}><span className={styles.reviewIcon}>{selectedMode.icon}</span><div><small>EDIT TYPE</small><strong>{selectedMode.title}</strong></div></div><div><small>REEL TYPE</small><strong>{category}</strong><p>{format} · {vibe}</p></div><div className={styles.reviewFull}><small>EDITING DIRECTION</small><p>{creativeDirection}</p></div><div><small>HOOK</small><p>{hookEnabled ? hookText : "No hook"}</p></div><div><small>REFERENCE</small><p className={styles.referenceText}>{reference || "None"}</p></div><div className={styles.reviewFull}><small>FOOTAGE</small><p>{clips.length} {clips.length === 1 ? "clip" : "clips"} ready for analysis.</p></div></div>{error && <div className={styles.submitError}>{error}</div>}<div className={styles.reviewActions}><button onClick={() => setStep(3)} className={styles.back}>Back</button><button className={styles.submitButton} onClick={submitOrder} disabled={uploading}>{uploading ? "EDITIO IS WORKING…" : `Create my ${selectedMode.title}`}<span>↗</span></button></div></div>}
    </section></main>;
}
