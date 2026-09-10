export default function Home() {
  return (
    <main className="page">
      <nav className="nav">
        <a className="logo" href="#">EDIT<span>IO</span></a>
        <div className="navLinks"><a href="#services">How it works</a><a href="#services">AI Edit</a><a href="#start">For creators</a></div>
        <a className="navCta" href="/creator/login">Get started ↗</a>
      </nav>

      <section className="hero">
        <div className="heroCopy">
          <div className="kicker"><span className="dot" /> MADE FOR THE SCROLL GENERATION</div>
          <h1>Turn raw clips into <span className="highlight">content.</span></h1>
          <p className="heroText">Shoot it. Upload it. EDITIO studies the footage, finds the story, and builds a scroll-stopping Reel — from hook to final frame.</p>
          <div className="actions"><a className="primary" href="/creator/login">Edit my Reel ↗</a><a className="secondary" href="#services">See how it works ↓</a></div>
        </div>
        <div className="visual" aria-label="EDITIO AI editor">
          <div className="phoneWrap">
            <div className="sticker">YOU SHOOT.<br/>AI EDITS.</div>
            <div className="phone"><div className="phoneTop"><div className="island" /></div><div className="video"><div className="spark">✦</div><div className="videoTag">EDITIO / AI</div><div className="videoTitle">MAKE<br/>THE<br/>SCROLL<br/>STOP.</div></div></div>
          </div>
          <div className="rolePanel">
            <div className="roleIntro"><div className="eyebrow">WELCOME TO EDITIO</div><h2 className="roleTitle">Your AI editor is ready.</h2></div>
            <div className="roleCards">
              <a className="roleCard" href="/creator/login">
                <div className="roleIcon">✦</div><div><div className="roleName">I&apos;m a Content Creator</div><div className="roleDesc">I want my clips edited &amp; ready to post.</div></div><div className="roleArrow">↗</div>
              </a>
            </div>
            <div className="roleNote">Upload the footage. Give us the vibe. EDITIO handles the edit.</div>
          </div>
        </div>
      </section>

      <div className="marquee"><div className="marqueeInner">AI EDITS ✦ SMART HOOKS ✦ SMART CUTS ✦ SOUND ✦ REELS ✦ SHORTS ✦ READY TO POST ✦ AI EDITS ✦ SMART HOOKS ✦ SMART CUTS ✦ SOUND ✦ REELS ✦ SHORTS ✦ READY TO POST ✦</div></div>

      <section className="services" id="services">
        <div className="sectionHead"><div><div className="eyebrow">ONE ENGINE. THE WHOLE REEL.</div><h2>From raw footage<br/>to ready-to-post.</h2></div><div className="eyebrow">01 — 01</div></div>
        <div className="serviceGrid">
          <article className="card lime"><div><div className="icon">✦</div><h3>AI Edit</h3><p>AI finds the real main moment, builds the story, cuts dead time, creates a hook when useful, adds tasteful text and sound, reframes the action, and renders a Reel-ready draft.</p></div><div className="cardArrow">↗</div></article>
        </div>
      </section>

      <section className="bottomCta" id="start"><div><div className="eyebrow">READY WHEN YOU ARE</div><h2>Stop spending hours editing. Start posting.</h2></div><a className="primary" href="/creator/login">Start your first AI edit ↗</a></section>
      <footer className="footer"><div>© 2026 EDITIO</div><div>CREATE. EDIT. POST.</div></footer>
    </main>
  );
}
