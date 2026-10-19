import { useEffect, useState } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "./state/AuthContext.jsx";
export default function App() {
 const [theme,setTheme]=useState(localStorage.getItem("inkwell_theme")||"light"); const {user,loading,logout}=useAuth(); const navigate=useNavigate();
 useEffect(()=>{document.documentElement.setAttribute("data-theme",theme);localStorage.setItem("inkwell_theme",theme);},[theme]);
 if(loading)return <div className="app-loading">Opening your writing space…</div>;
 return <div className="app-shell"><header className="app-header"><Link to="/" className="brand"><span className="brand-mark">Ink</span>well</Link><div className="header-actions"><button className="theme-toggle" onClick={()=>setTheme(t=>t==="dark"?"light":"dark")} aria-label="Toggle dark mode">{theme==="dark"?"☀ Light":"☾ Dark"}</button>{user?<><span className="user-greeting">{user.name}</span><button className="text-button" onClick={async()=>{await logout();navigate('/login',{replace:true});}}>Sign out</button></>:<Link className="text-button" to="/login">Sign in</Link>}</div></header><main className="app-main"><Outlet /></main></div>;
}
