import { lazy, Suspense, useEffect, useState } from "react";
import { ApiError, request, type CurrentUser } from "./api";
import { Icon } from "./icons";
import { Landing } from "./Landing";
import { LabsWorkspace } from "./LabsWorkspace";
import { SignIn } from "./SignIn";

// Vite replaces import.meta.env.DEV with false in production builds, so this
// branch, the dynamic import and the switcher's chunk are removed entirely.
const DevPersonaSwitcher = import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH === "1"
  ? lazy(() => import("./dev/DevPersonaSwitcher"))
  : null;

function Brand() {
  return <a className="brand" href="/" aria-label="VInventory home"><span>VInventory<span className="brand-dot" aria-hidden="true" /></span></a>;
}

export function App() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [dark, setDark] = useState(() => {
    try { const theme=localStorage.getItem("vinventory-theme"); return theme ? theme==="dark" : (window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false); } catch { return false; }
  });
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); if (dark) document.documentElement.dataset.theme = "dark"; else delete document.documentElement.dataset.theme; try { localStorage.setItem("vinventory-theme", dark?"dark":"light"); } catch { /* Theme still works without storage. */ } }, [dark]);
  useEffect(() => {
    let active = true;
    setChecking(true); setError("");
    request<{ user: CurrentUser }>("/api/me").then(body => { if (active) setUser(body.user); }).catch((reason: unknown) => {
      if (!active) return;
      setUser(null);
      if (!(reason instanceof ApiError && reason.status === 401)) setError(reason instanceof Error ? reason.message : "Could not check your session.");
    }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [retry]);
  async function signOut() {
    setSigningOut(true); setError("");
    try { await request<void>("/auth/logout", { method: "POST" }); window.history.replaceState(null,"","/"); setUser(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not sign out."); }
    finally { setSigningOut(false); }
  }
  const isWorkspace = window.location.pathname === "/labs" || window.location.pathname.startsWith("/labs/");
  const providerError = new URLSearchParams(window.location.search).get("authError") === "provider_unavailable";
  return <>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <header className="site-header"><div className="container header-inner"><Brand/><nav aria-label="Main navigation">{isWorkspace ? <a className="nav-active" aria-current="page" href="/labs">Labs</a> : <><a href="#how-it-works">How it works</a><a href="#who-its-for">Who it’s for</a></>}</nav><div className="header-actions">{DevPersonaSwitcher && <Suspense fallback={null}><DevPersonaSwitcher user={user} /></Suspense>}<button className="icon-button" aria-label={`Switch to ${dark?"light":"dark"} theme`} onClick={()=>setDark(!dark)}><Icon name={dark?"sun":"moon"}/></button>{checking ? <span className="session-check" role="status">Checking session…</span> : user ? <><a className="account-chip" href="/labs" aria-label={`Open labs, signed in as ${user.displayName}`} title={user.displayName}><span className="avatar">{user.displayName.split(" ").map(p=>p[0]).slice(0,2).join("")}</span><span>{user.displayName}</span></a><button className="icon-button" aria-label="Sign out" title="Sign out" disabled={signingOut} onClick={()=>void signOut()}><Icon name="logout"/></button></> : <SignIn/>}</div></div></header>
    {(error || providerError) && <div className="container"><div className="service-alert" role="alert"><Icon name="shield"/><span>{error || "VAuth is temporarily unavailable. Please try signing in again in a moment."}</span>{error && <button className="secondary" onClick={()=>setRetry(n=>n+1)}>Retry connection</button>}</div></div>}
    {isWorkspace ? checking ? <main id="main-content" className="container workspace empty-state" role="status"><h1>Opening your workspace…</h1></main> : user ? <LabsWorkspace user={user} onExpired={()=>setUser(null)}/> : <main id="main-content" className="container workspace empty-state"><Icon name="shield"/><h1>Your labs are one sign-in away.</h1><p>Use your verified college account to explore participating labs.</p><SignIn/><a className="text-link" href="/">Back to VInventory</a></main> : <Landing user={user}/>}
    <footer className="site-footer"><div className="container footer-inner"><Brand/><span>A VOSS Labs product.</span><span>Built for the work that starts in a lab.</span></div></footer>
  </>;
}
