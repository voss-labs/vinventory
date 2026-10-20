import { useEffect, useState } from "react";
import type { CurrentUser } from "../api";

type Persona = { key: string; name: string; role: string; scope: string };

const explanation = "Development only. Sign-in is bypassed; every permission is still resolved from the database, exactly as in production.";

export default function DevPersonaSwitcher({ user = null }: { user?: CurrentUser | null }) {
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/auth/dev/personas", { credentials: "same-origin" })
      .then(async (response) => (response.ok ? ((await response.json()) as { personas: Persona[] }).personas : null))
      .then((list) => { if (active) setPersonas(list); })
      .catch(() => { if (active) setPersonas(null); });
    return () => { active = false; };
  }, []);

  async function switchTo(persona: string) {
    if (!persona) return;
    setError("");
    try {
      const response = await fetch("/auth/dev/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ persona }),
      });
      if (!response.ok) throw new Error(String(response.status));
      window.location.assign("/labs");
    } catch {
      setError("Could not sign in. Is the dev database seeded (pnpm dev:seed)?");
    }
  }

  if (!personas) return null;
  const current = user && personas.find((persona) => persona.name === user.displayName);
  const placeholder = !user ? "Development sign-in…" : current ? `${user.displayName} · ${current.role}` : user.displayName;
  return <div className="dev-switcher" title={explanation}>
    <span className="dev-badge" aria-hidden="true">DEV</span>
    <select aria-label={user ? "Sign in as someone else" : "Development sign-in"} defaultValue="" onChange={(event) => void switchTo(event.target.value)}>
      <option value="" disabled>{placeholder}</option>
      {personas.map((persona) => <option key={persona.key} value={persona.key} title={persona.scope}>{persona.name} · {persona.role}</option>)}
    </select>
    {error && <span role="alert" className="dev-switcher-error">{error}</span>}
  </div>;
}
