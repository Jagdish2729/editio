"use client";

import Link from "next/link";
import { ChangeEvent, DragEvent, useMemo, useState } from "react";
import { createOrder, updateOrder } from "../../../lib/orders";
import { extractVideoFrames, type VideoFrame } from "../../../lib/video-analysis";
import styles from "./edit.module.css";

type Clip = { id: string; file: File; url: string };
const modes = [
  { id: "ai" as const, icon: "✦", title: "AI Edit", note: "Fast + affordable", text: "Let AI find the best moments, pacing and captions for you." },
  { id: "human" as const, icon: "◒", title: "Human Edit", note: "Personal + creative", text: "A real editor turns your footage into something that feels like you." },
  { id: "both" as const, icon: "⚡", title: "AI + Human", note: "Premium + polished", text: "AI builds the first cut. A human editor gives it the final glow-up." },
];

type UploadResponse = { ok?: boolean; error?: string; files?: Array<{ originalName: string; url: string }> };
type AIResponse = { ok?: boolean; error?: string; plan?: unknown };

export default function CreatorEdit() {
  const [mode, setMode] = useState<"ai"|"human"|"both">("ai");
  const [step,setStep]=useState(1); const [clips,setClips]=useState<Clip[]>([]); const [dragging,setDragging]=useState(false);
  const [format,setFormat]=useState("Instagram Reel"); const [vibe,setVibe]=useState("Fast & punchy"); const [brief,setBrief]=useState(""); const [reference,setReference]=useState("");
  const [submitted,setSubmitted]=useState(false); const [orderId,setOrderId]=useState(""); const [uploading,setUploading]=useState(false); const [error,setError]=useState(""); const [aiResult,setAiResult]=useState<"ready"|"failed"|"not_started">("not_started");
  const selectedMode=useMemo(()=>modes.find(m=>m.id===mode)!,[mode]);

  function addFiles(files:FileList|File[]){const incoming=Array.from(files).filter(f=>f.type.startsWith("video/"));setClips(c=>[...c,...incoming.map(file=>({id:`${file.name}-${file.size}-${crypto.randomUUID()}`,file,url:URL.createObjectURL(file)}))]);}
  function onFileChange(e:ChangeEvent<HTMLInputElement>){if(e.target.files)addFiles(e.target.files);e.target.value="";}
  function onDrop(e:DragEvent<HTMLLabelElement>){e.preventDefault();setDragging(false);if(e.dataTransfer.files.length)addFiles(e.dataTransfer.files);}
  function removeClip(id:string){setClips(c=>{const x=c.find(v=>v.id===id);if(x)URL.revokeObjectURL(x.url);return c.filter(v=>v.id!==id);});}
  function moveClip(i:number,d:-1|1){setClips(c=>{const t=i+d;if(t<0||t>=c.length)return c;const n=[...c];[n[i],n[t]]=[n[t],n[i]];return n;});}

  async function submitOrder(){
    if(!clips.length||uploading)return;
    setError("");setUploading(true);
    try{
      const formData=new FormData(); clips.forEach(c=>formData.append("files",c.file,c.file.name));
      const uploadResponse=await fetch("/api/uploads",{method:"POST",body:formData});
      const uploadData=await uploadResponse.json() as UploadResponse;
      if(!uploadResponse.ok||!uploadData.files?.length)throw new Error(uploadData.error||"Could not upload your footage.");
      const clipUrls=uploadData.files.map(file=>file.url);
      const clipNames=uploadData.files.map(file=>file.originalName);
      const order=createOrder({mode,modeLabel:selectedMode.title,format,vibe,brief:brief.trim(),reference:reference.trim(),clipNames,clipUrls,clipCount:clipUrls.length,aiStatus:mode==="human"?"not_started":"queued"});
      if(!order)throw new Error("Could not create the edit order.");
      setOrderId(order.id);

      if(mode!=="human"){
        try{
          const frames:VideoFrame[]=[];
          for(const clip of clips){frames.push(...await extractVideoFrames(clip.file.name,clip.url));}
          if(!frames.length)throw new Error("Could not read frames from your footage.");
          setUploading(true);
          const aiResponse=await fetch("/api/ai/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({orderId:order.id,editType:selectedMode.title,format,vibe,brief:brief.trim(),reference:reference.trim(),frames})});
          const aiData=await aiResponse.json() as AIResponse;
          if(!aiResponse.ok||!aiData.plan)throw new Error(aiData.error||"AI footage analysis failed.");
          updateOrder(order.id,{status:"processing",aiStatus:"ready",aiPlan:aiData.plan as never});setAiResult("ready");
        }catch(e){updateOrder(order.id,{status:"processing",aiStatus:"failed",aiError:e instanceof Error?e.message:"AI analysis failed."});setAiResult("failed");}
      }
      setSubmitted(true);
    }catch(e){setError(e instanceof Error?e.message:"Something went wrong. Please try again.");}
    finally{setUploading(false);}
  }

  if(submitted)return <main className={styles.page}><header className={styles.nav}><Link className={styles.logo} href="/creator/dashboard">EDIT<span>IO</span></Link><span className={styles.successTag}>ORDER RECEIVED ✦</span><Link className={styles.exit} href={`/creator/orders/${orderId}`}>Open my edit ↗</Link></header><section className={styles.successShell}><div className={styles.successBadge}>{mode==="human"?"✦ YOU&apos;RE IN THE QUEUE":aiResult==="ready"?"✦ AI HAS STUDIED YOUR FOOTAGE":"✦ EDITIO HAS YOUR FOOTAGE"}</div><h1>We&apos;ve got<br/><em>your Reel.</em></h1><p>{mode==="human"?`Your footage is uploaded and your request is safely queued for a human editor.`:aiResult==="ready"?"Your footage and creative brief have been analyzed. The next step is turning the AI plan into your first cut.":"Your footage is uploaded. AI analysis will need another attempt before the first cut can be prepared."}</p><div className={styles.orderCard}><div><span>ORDER</span><strong>{orderId}</strong></div><div><span>EDIT TYPE</span><b>{selectedMode.title}</b></div><div><span>AI PLANNER</span><b className={aiResult==="failed"?styles.statusPillMuted:styles.statusPill}>{mode==="human"?"Not needed":aiResult==="ready"?"Plan ready":"Needs retry"}</b></div></div><Link href={`/creator/orders/${orderId}`} className={styles.successButton}>Open my edit <span>↗</span></Link></section></main>;

  return <main className={styles.page}><header className={styles.nav}><Link className={styles.logo} href="/creator/dashboard">EDIT<span>IO</span></Link><div className={styles.stepper}><span className={step>=1?styles.active:""}>01</span><i/><span className={step>=2?styles.active:""}>02</span><i/><span className={step>=3?styles.active:""}>03</span><i/><span className={step>=4?styles.active:""}>04</span></div><Link className={styles.exit} href="/creator/dashboard">Save &amp; exit</Link></header><section className={styles.shell}><div className={styles.heading}><div className={styles.eyebrow}>NEW EDIT / 001</div><h1>Let&apos;s make<br/><em>your Reel.</em></h1><p>{step===3?"Upload the footage. We&apos;ll study the actual frames and take it from there.":step===4?"One last look before we put your edit in motion.":"First, tell us how much creative energy you want from EDITIO."}</p></div>
  {step===1&&<div className={styles.modeGrid}>{modes.map(item=><button key={item.id} onClick={()=>setMode(item.id)} className={`${styles.mode} ${mode===item.id?styles.selected:""}`}><div className={styles.modeTop}><span className={styles.modeIcon}>{item.icon}</span><span className={styles.radio}>{mode===item.id?"●":"○"}</span></div><div><h2>{item.title}</h2><span className={styles.note}>{item.note}</span><p>{item.text}</p></div><span className={styles.arrow}>↗</span></button>)}<button className={styles.continue} onClick={()=>setStep(2)}>Continue with {selectedMode.title}<span>↗</span></button></div>}
  {step===2&&<div className={styles.briefCard}><div className={styles.briefHead}><div><div className={styles.eyebrow}>STEP 02 / YOUR BRIEF</div><h2>Give us the vibe.</h2></div><button onClick={()=>setStep(1)}>← Change edit type</button></div><div className={styles.fields}><label>What are you making?<select value={format} onChange={e=>setFormat(e.target.value)}><option>Instagram Reel</option><option>YouTube Short</option><option>Other short-form video</option></select></label><label>What&apos;s the vibe?<select value={vibe} onChange={e=>setVibe(e.target.value)}><option>Fast &amp; punchy</option><option>Clean &amp; minimal</option><option>Cinematic</option><option>Fun &amp; chaotic</option></select></label><label className={styles.full}>Tell us what you want<textarea value={brief} onChange={e=>setBrief(e.target.value)} placeholder="e.g. Keep the funny moments, quick cuts, bold captions, trending feel..."/></label><label className={styles.full}>Reference Reel<input value={reference} onChange={e=>setReference(e.target.value)} placeholder="Paste a Reel / TikTok / Shorts link (optional)"/></label></div><div className={styles.briefActions}><button onClick={()=>setStep(1)} className={styles.back}>Back</button><button className={styles.continue} onClick={()=>setStep(3)}>Next: Upload clips<span>↗</span></button></div></div>}
  {step===3&&<div className={styles.briefCard}><div className={styles.briefHead}><div><div className={styles.eyebrow}>STEP 03 / FOOTAGE</div><h2>Drop your clips.</h2></div><span className={styles.clipCount}>{clips.length} {clips.length===1?"clip":"clips"}</span></div><label className={`${styles.upload} ${dragging?styles.uploadDragging:""}`} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={onDrop}><input type="file" accept="video/mp4,video/quicktime,video/webm,video/*" multiple onChange={onFileChange}/><span>＋</span><b>{dragging?"Drop them here":"Drop videos here"}</b><small>or click to browse · MP4, MOV, WebM</small></label>{clips.length>0&&<div className={styles.clipList}>{clips.map((clip,index)=><div className={styles.clip} key={clip.id}><div className={styles.clipPreview}><video src={clip.url} muted preload="metadata"/></div><div className={styles.clipInfo}><b>{clip.file.name}</b><small>{(clip.file.size/(1024*1024)).toFixed(1)} MB · Clip {index+1}</small></div><div className={styles.clipActions}><button disabled={index===0} onClick={()=>moveClip(index,-1)}>↑</button><button disabled={index===clips.length-1} onClick={()=>moveClip(index,1)}>↓</button><button onClick={()=>removeClip(clip.id)}>×</button></div></div>)}</div>}<div className={styles.briefActions}><button onClick={()=>setStep(2)} className={styles.back}>Back</button><button className={`${styles.continue} ${clips.length===0?styles.disabled:""}`} disabled={!clips.length} onClick={()=>setStep(4)}>Review order<span>↗</span></button></div></div>}
  {step===4&&<div className={styles.reviewCard}><div className={styles.reviewHeader}><div><div className={styles.eyebrow}>STEP 04 / FINAL CHECK</div><h2>Looks good?</h2></div><span className={styles.readyPill}>READY TO EDIT ✦</span></div><div className={styles.reviewGrid}><div className={styles.reviewMode}><span className={styles.reviewIcon}>{selectedMode.icon}</span><div><small>EDIT TYPE</small><strong>{selectedMode.title}</strong><p>{selectedMode.note}</p></div></div><div><small>FORMAT</small><strong>{format}</strong></div><div><small>VIBE</small><strong>{vibe}</strong></div><div><small>FOOTAGE</small><strong>{clips.length} {clips.length===1?"clip":"clips"}</strong><p>{clips.map(c=>c.file.name).join(", ")}</p></div><div className={styles.reviewFull}><small>YOUR BRIEF</small><p>{brief||"No extra instructions added."}</p></div>{reference&&<div className={styles.reviewFull}><small>REFERENCE</small><p className={styles.referenceText}>{reference}</p></div>}</div>{error&&<div className={styles.submitError}>{error}</div>}<div className={styles.reviewActions}><button onClick={()=>setStep(3)} className={styles.back} disabled={uploading}>← Back &amp; edit</button><button className={styles.submitButton} disabled={uploading} onClick={submitOrder}>{uploading?"Uploading + AI analyzing…":"Submit my edit"} <span>↗</span></button></div></div>}
  </section></main>;
}
