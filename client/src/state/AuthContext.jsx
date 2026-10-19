import { createContext, useContext, useEffect, useState } from "react";
const AuthContext=createContext(null);
async function request(path,options={}) { const res=await fetch(path,{credentials:"include",...options,headers:{"Content-Type":"application/json",...(options.headers||{})}}); if(res.status===204)return null; const body=await res.json().catch(()=>({})); if(!res.ok)throw new Error(body.error||`Request failed (${res.status})`); return body; }
export function AuthProvider({children}) { const [user,setUser]=useState(null); const [loading,setLoading]=useState(true); useEffect(()=>{request('/api/auth/me').then(d=>setUser(d.user)).catch(()=>setUser(null)).finally(()=>setLoading(false));},[]);
 const value={user,loading,login:async data=>{const d=await request('/api/auth/login',{method:'POST',body:JSON.stringify(data)});setUser(d.user);return d.user;},signup:async data=>{const d=await request('/api/auth/signup',{method:'POST',body:JSON.stringify(data)});setUser(d.user);return d.user;},logout:async()=>{await request('/api/auth/logout',{method:'POST'});setUser(null);}};
 return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>; }
export function useAuth(){return useContext(AuthContext);}
export async function apiRequest(path,options={}) { return request(path,options); }
