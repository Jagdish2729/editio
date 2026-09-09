import Link from "next/link";

export default function CreatorLogin() {
  return (
    <main className="authPage">
      <div className="authGlow authGlowOne" />
      <div className="authGlow authGlowTwo" />
      <nav className="authNav"><Link className="logo" href="/">EDIT<span>IO</span></Link><Link className="backLink" href="/">← Back home</Link></nav>
      <section className="authShell">
        <div className="authIntro"><div className="authBadge"><span>✦</span> CREATOR MODE</div><h1>Your content.<br/><em>Your way.</em></h1><p>Sign in to turn your raw footage into Reels that actually deserve the scroll.</p><div className="miniStats"><div><strong>01</strong><span>Upload</span></div><div><strong>02</strong><span>Brief</span></div><div><strong>03</strong><span>Post</span></div></div></div>
        <div className="authCard">
          <div className="authCardTop"><div><div className="eyebrow">WELCOME BACK</div><h2>Creator login</h2></div><div className="authMark">✦</div></div>
          <form className="authForm">
            <label>Email or mobile<input type="text" placeholder="you@example.com" /></label>
            <label>Password<div className="passwordWrap"><input type="password" placeholder="••••••••" /><span>Show</span></div></label>
            <div className="formMeta"><label className="check"><input type="checkbox" /> Remember me</label><a href="#">Forgot password?</a></div>
            <button className="authSubmit" type="submit">Sign in <span>↗</span></button>
          </form>
          <div className="divider"><span>or</span></div>
          <button className="socialBtn" type="button"><span className="googleG">G</span> Continue with Google</button>
          <p className="authFoot">New to EDITIO? <Link href="/creator/register">Create an account ↗</Link></p>
        </div>
      </section>
    </main>
  );
}
