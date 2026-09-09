import Link from "next/link";

export default function EditorLogin() {
  return (
    <main className="authPage editorAuth">
      <div className="authGlow authGlowOne" /><div className="authGlow authGlowTwo" />
      <nav className="authNav"><Link className="logo" href="/">EDIT<span>IO</span></Link><Link className="backLink" href="/">← Back home</Link></nav>
      <section className="authShell">
        <div className="authIntro"><div className="authBadge darkBadge"><span>◒</span> EDITOR MODE</div><h1>Make the cut.<br/><em>Make it count.</em></h1><p>Join EDITIO&apos;s editing crew, work on creator projects, and turn your editing skills into paid work.</p><div className="miniStats"><div><strong>01</strong><span>Apply</span></div><div><strong>02</strong><span>Edit</span></div><div><strong>03</strong><span>Earn</span></div></div></div>
        <div className="authCard">
          <div className="authCardTop"><div><div className="eyebrow">GOOD TO SEE YOU</div><h2>Editor login</h2></div><div className="authMark">◒</div></div>
          <form className="authForm">
            <label>Email or mobile<input type="text" placeholder="you@example.com" /></label>
            <label>Password<div className="passwordWrap"><input type="password" placeholder="••••••••" /><span>Show</span></div></label>
            <div className="formMeta"><label className="check"><input type="checkbox" /> Remember me</label><a href="#">Forgot password?</a></div>
            <button className="authSubmit" type="submit">Sign in <span>↗</span></button>
          </form>
          <div className="divider"><span>or</span></div>
          <button className="socialBtn" type="button"><span className="googleG">G</span> Continue with Google</button>
          <p className="authFoot">Want to edit with EDITIO? <Link href="/editor/register">Apply as an editor ↗</Link></p>
        </div>
      </section>
    </main>
  );
}
