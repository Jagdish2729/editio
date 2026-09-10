"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { endSession, getUser, type EditioUser } from "../../../lib/session";
import { getOrders, type EditOrder } from "../../../lib/orders";
import styles from "./dashboard.module.css";

const statusLabel: Record<EditOrder["status"], string> = { submitted: "Submitted", processing: "In progress", in_review: "Ready for review", completed: "Completed" };

export default function CreatorDashboard() {
  const [user,setUser]=useState<EditioUser|null>(null); const [orders,setOrders]=useState<EditOrder[]>([]); const [ready,setReady]=useState(false);
  useEffect(()=>{setUser(getUser());setOrders(getOrders());setReady(true);},[]); if(!ready)return null;
  const name=user?.name?.split(" ")[0]||"Creator"; const aiCredits=user?.aiFreeCreditUsed===true?0:1;
  return <main className={styles.page}><div className={styles.noise}/><header className={styles.nav}><Link className={styles.logo} href="/">EDIT<span>IO</span></Link><div className={styles.navRight}><span className={styles.credit}><b>{String(aiCredits).padStart(2,"0")}</b> free AI credit</span><button className={styles.avatar} aria-label="Account">{name.charAt(0).toUpperCase()}</button></div></header>
    <section className={styles.hero}><div><div className={styles.eyebrow}>CREATOR SPACE <span>●</span></div><h1>Hey {name}.<br/><em>Let&apos;s make<br/>something.</em></h1><p>Drop the footage. Pick the vibe. EDITIO will handle the edit from first cut to final frame.</p></div><div className={styles.heroOrb}><div className={styles.orbInner}>✦</div><span>YOUR<br/>NEXT<br/>REEL<br/>STARTS<br/>HERE.</span></div></section>
    <section className={styles.editSection}><div className={styles.sectionLabel}><span>01</span><div><b>START AN EDIT</b><small>One AI editor. Full Reel workflow.</small></div></div><div className={styles.serviceGrid}><Link href="/creator/edit" className={`${styles.service} ${styles.lime}`}><div className={styles.serviceIcon}>✦</div><div><h2>AI Edit</h2><p>Find the story, build the pacing, polish the details and make it ready to post.</p></div><div className={styles.serviceArrow}>↗</div></Link></div></section>
    <section className={styles.lowerGrid}><div className={styles.recent}><div className={styles.sectionTop}><div><span>02</span><b>MY EDITS</b></div>{orders.length>0&&<span className={styles.orderCount}>{orders.length} {orders.length===1?"order":"orders"}</span>}</div>
      {orders.length===0?<div className={styles.emptyState}><div className={styles.emptyIcon}>＋</div><h3>Your first Reel is waiting.</h3><p>Nothing here yet. Let&apos;s change that.</p><Link href="/creator/edit" className={styles.startLink}>Start an AI edit ↗</Link></div>:<div className={styles.orderList}>{orders.slice(0,5).map(order=><Link href={`/creator/orders/${order.id}`} className={styles.orderRow} key={order.id}><div className={styles.orderMode}>✦</div><div className={styles.orderMain}><strong>AI Edit</strong><small>{order.format} · {order.clipCount} {order.clipCount===1?"clip":"clips"}</small></div><div className={styles.orderMeta}><b>{statusLabel[order.status]}</b><small>{new Date(order.createdAt).toLocaleDateString()}</small></div><span>↗</span></Link>)}</div>}</div>
      <aside className={styles.creditCard}><div><span className={styles.smallTag}>EDITIO CREDIT</span><div className={styles.creditBig}>{String(aiCredits).padStart(2,"0")}</div><p>{aiCredits===1?"free AI edit credit":"no free AI credits left"}</p></div><div className={styles.creditBottom}><span>{aiCredits===1?"Use it whenever you&apos;re ready.":"Buy a credit for your next AI Reel."}</span><span className={styles.spark}>✦</span></div></aside></section>
    <footer className={styles.footer}><span>CREATE. EDIT. POST.</span><button onClick={()=>{endSession();window.location.href="/";}}>Log out ↗</button></footer></main>;
}
