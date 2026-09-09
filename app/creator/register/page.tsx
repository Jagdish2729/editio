"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { saveCreatorUser, startSession } from "../../../lib/session";

export default function CreatorRegister() {
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim().length < 2) return setError("Tell us your name first.");
    if (!identifier.trim()) return setError("Add your email or mobile number.");
    if (password.length < 8) return setError("Password needs at least 8 characters.");
    saveCreatorUser({ name: name.trim(), identifier: identifier.trim() });
    startSession();
    window.location.href = "/creator/dashboard";
  }

  return (
    <main className="authPage">
      <div className="authGlow authGlowOne" /><div className="authGlow authGlowTwo" />
      <nav className="authNav"><Link className="logo" href="/">EDIT<span>IO</span></Link><Link className="backLink" href="/creator/login">← Back to login</Link></nav>
      <section className="authShell">
        <div className="authIntro"><div className="authBadge"><span>✦</span> CREATOR MODE</div><h1>Let&apos;s make<br/><em>something.</em></h1><p>Create your EDITIO account. No public profile, no complicated setup — just sign up and start your first edit.</p><div className="miniStats"><div><strong>01</strong><span>Sign up</span></div><div><strong>02</strong><span>Upload</span></div><div><strong>03</strong><span>Post</span></div></div></div>
        <div className="authCard">
          <div className="authCardTop"><div><div className="eyebrow">FIRST TIME HERE?</div><h2>Create account</h2></div><div className="authMark">✦</div></div>
          <form className="authForm" onSubmit={submit}>
            <label>Your name<input value={name} onChange={e => setName(e.target.value)} type="text" placeholder="What should we call you?" autoComplete="name" /></label>
            <label>Email or mobile<input value={identifier} onChange={e => setIdentifier(e.target.value)} type="text" placeholder="you@example.com" autoComplete="username" /></label>
            <label>Create password<input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="At least 8 characters" autoComplete="new-password" /></label>
            {error && <div className="authError">{error}</div>}
            <button className="authSubmit" type="submit">Create my account <span>↗</span></button>
          </form>
          <p className="authFoot">Already have an account? <Link href="/creator/login">Sign in ↗</Link></p>
        </div>
      </section>
    </main>
  );
}
