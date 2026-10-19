import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../state/AuthContext.jsx";

export default function Auth({ mode = "login" }) {
  const signup = mode === "signup";
  const { user, login, signup: createAccount } = useAuth();
  const [name, setName] = useState(""); const [email, setEmail] = useState("");
  const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const navigate = useNavigate(); const [params] = useSearchParams();
  if (user) return <Navigate to="/" replace />;
  async function submit(e) { e.preventDefault(); setBusy(true); setError(""); try { if(signup) await createAccount({name,email,password}); else await login({email,password}); navigate(params.get("next") || "/", {replace:true}); } catch(e) { setError(e.message || "Something went wrong."); } finally { setBusy(false); } }
  return <div className="auth-page"><Link to="/" className="brand auth-brand"><span className="brand-mark">Ink</span>well</Link><section className="auth-card"><p className="eyebrow">YOUR SPACE TO WRITE</p><h1>{signup ? "Create your account" : "Welcome back"}</h1><p className="auth-sub">{signup ? "A calm space for your ideas, drafts, and documents." : "Sign in to pick up where you left off."}</p><form onSubmit={submit} className="auth-form">{signup && <label>Your name<input autoComplete="name" value={name} onChange={e=>setName(e.target.value)} required minLength={2} maxLength={80} placeholder="Your name" /></label>}<label>Email address<input autoComplete="email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required maxLength={254} placeholder="you@example.com" /></label><label>Password<input autoComplete={signup?"new-password":"current-password"} type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={8} maxLength={128} placeholder="At least 8 characters" /></label>{error && <p className="error-text" role="alert">{error}</p>}<button type="submit" disabled={busy}>{busy ? "Please wait…" : signup ? "Create account" : "Sign in"}</button></form><p className="auth-switch">{signup ? "Already have an account? " : "New to Inkwell? "}<Link to={signup?"/login":"/signup"}>{signup ? "Sign in" : "Create an account"}</Link></p><p className="auth-note">Your documents are private to your account.</p></section></div>;
}
