"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { startSession, validateCreatorLogin } from "../../../lib/session";

export default function CreatorLogin() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!identifier.trim() || !password) return setError("Enter your login details to continue.");
    setLoading(true);
    const valid = await validateCreatorLogin(identifier, password);
    if (!valid) { setLoading(false); return setError("Email/mobile or password is incorrect."); }
    startSession();
    window.location.href = "/creator/dashboard";
  }

  return (
    <main className="authPage">
      <div className="authGlow authGlowOne" /><div className="authGlow authGlowTwo" />
      <nav className="authNav"><Link className="logo" href="/">EDIT<span>IO</span></Link><Link className="backLink" href="/">← Back home</Link></nav>
      <section className="authShell">
        <div className="authIntro"><div className="authBadge"><span>✦</span> CREATOR MODE</div><h1>Your content.<br/><em>Your way.</em></h1><p>Sign in to turn your raw footage into Reels that actually deserve the scroll.</p><div className="miniStats"><div><strong>01</strong><span>Upload</span></div><div><strong>02</strong><span>Brief</span></div><div><strong>03</strong><span>Post</span></div></div></div>
        <div className="authCard">
          <div className="authCardTop"><div><div className="eyebrow">WELCOME BACK</div><h2>Creator login</h2></div><div className="authMark">✦</div></div>
          <form className="authForm" onSubmit={submit}>
            <label>Email or mobile<input value={identifier} onChange={e => setIdentifier(e.target.value)} type="text" placeholder="you@example.com" autoComplete="username" /></label>
            <label>Password<div className="passwordWrap"><input value={password} onChange={e => setPassword(e.target.value)} type={showPassword ? "text" : "password"} placeholder="••••••••" autoComplete="current-password" /><span onClick={() => setShowPassword(v => !v)}>{showPassword ? "Hide" : "Show"}</span></div></label>
            <div className="formMeta"><label className="check"><input type="checkbox" /> Remember me</label><a href="#">Forgot password?</a></div>
            {error && <div className="authError">{error}</div>}
            <button className="authSubmit" type="submit" disabled={loading}>{loading ? "Signing in…" : "Sign in"} <span>↗</span></button>
          </form>
          <div className="divider"><span>or</span></div><button className="socialBtn" type="button"><span className="googleG">G</span> Continue with Google</button>
          <p className="authFoot">New to EDITIO? <Link href="/creator/register">Create an account ↗</Link></p>
        </div>
      </section>
    </main>
  );
}
