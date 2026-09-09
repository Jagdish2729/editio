export default function Home() {
  return (
    <main className="page">
      <nav className="nav">
        <a className="logo" href="#">EDIT<span>IO</span></a>
        <div className="navLinks"><a href="#services">How it works</a><a href="#services">Services</a><a href="#start">For creators</a></div>
        <button className="navCta">Get started ↗</button>
      </nav>

      <section className="hero">
        <div>
          <div className="kicker"><span className="dot" /> MADE FOR THE SCROLL GENERATION</div>
          <h1>Turn raw clips into <span className="highlight">content.</span></h1>
          <p className="heroText">Shoot it. Upload it. We&apos;ll make it scroll-stopping. Choose AI speed, human creativity, or the best of both.</p>
          <div className="actions"><button className="primary">Edit my Reel ↗</button><button className="secondary">See how it works ↓</button></div>
        </div>
        <div className="visual" aria-label="EDITIO reel preview">
          <div className="sticker">YOU SHOOT.<br/>WE EDIT.</div>
          <div className="phone"><div className="phoneTop"><div className="island" /></div><div className="video"><div className="spark">✦</div><div className="videoTag">EDITIO / 001</div><div className="videoTitle">MAKE<br/>THE<br/>SCROLL<br/>STOP.</div></div></div>
        </div>
      </section>

      <div className="marquee"><div className="marqueeInner">AI EDITS ✦ HUMAN CREATIVITY ✦ AI + HUMAN ✦ REELS ✦ SHORTS ✦ CONTENT ✦ AI EDITS ✦ HUMAN CREATIVITY ✦ AI + HUMAN ✦ REELS ✦ SHORTS ✦ CONTENT ✦</div></div>

      <section className="services" id="services">
        <div className="sectionHead"><div><div className="eyebrow">ONE PLATFORM. THREE WAYS TO EDIT.</div><h2>Pick your<br/>editing energy.</h2></div><div className="eyebrow">01 — 03</div></div>
        <div className="serviceGrid">
          <article className="card"><div><div className="icon">🤖</div><h3>AI Edit</h3><p>Fast, affordable edits powered by AI. Upload your clips, tell us the vibe, and get a Reel-ready draft.</p></div><div className="cardArrow">↗</div></article>
          <article className="card dark"><div><div className="icon">👨‍🎨</div><h3>Human Edit</h3><p>Want a real creative eye? Our editors turn your footage into something that actually feels like you.</p></div><div className="cardArrow">↗</div></article>
          <article className="card lime"><div><div className="icon">⚡</div><h3>AI + Human</h3><p>Speed from AI. Polish from a human. The premium option for creators who want their best work.</p></div><div className="cardArrow">↗</div></article>
        </div>
      </section>

      <section className="bottomCta" id="start"><div><div className="eyebrow">READY WHEN YOU ARE</div><h2>Stop spending hours editing. Start posting.</h2></div><button className="primary">Start your first edit ↗</button></section>
      <footer className="footer"><div>© 2026 EDITIO</div><div>CREATE. EDIT. POST.</div></footer>
    </main>
  );
}
