import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export interface UserProfile { id:string; full_name:string; email:string; role:string; department:string; province_id:string; is_active:boolean }
interface AuthState { mode:'demo'|'cloud'|null; session:Session|null; profile:UserProfile|null; loading:boolean; error:string; reload:()=>void; signOut:()=>Promise<void>; passwordRecovery:boolean; finishRecovery:()=>void }
const AuthContext=createContext<AuthState|null>(null);

export function AuthProvider({children}:{children:React.ReactNode}) {
  const [mode,setMode]=useState<AuthState['mode']>(null);
  const [session,setSession]=useState<Session|null>(null);
  const [profile,setProfile]=useState<UserProfile|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [revision,setRevision]=useState(0);
  const [passwordRecovery,setPasswordRecovery]=useState(()=>window.location.pathname==='/auth/recovery'||window.location.hash.includes('type=recovery'));
  useEffect(()=>{
    let current=true;
    fetch('/api/appraisal/runtime').then(async r=>{if(!r.ok)throw new Error('Không kết nối được dịch vụ.');return r.json();})
      .then(data=>{if(current)setMode(data.mode);}).catch(e=>{if(current){setError(e.message);setLoading(false);}});
    return()=>{current=false;};
  },[revision]);
  useEffect(()=>{
    let current=true;
    supabase.auth.getSession().then(({data})=>{if(current)setSession(data.session);});
    const {data}=supabase.auth.onAuthStateChange((event,next)=>{if(event==='PASSWORD_RECOVERY')setPasswordRecovery(true);setSession(next);setProfile(previous=>previous?.id===next?.user.id?previous:null);});
    return()=>{current=false;data.subscription.unsubscribe();};
  },[]);
  useEffect(()=>{
    let current=true;
    setError('');
    if(!mode)return;
    if(mode==='demo'||!session){setProfile(null);setLoading(false);return;}
    setLoading(true);
    supabase.from('profiles').select('id,full_name,email,role,department,province_id,is_active')
      .eq('id',session.user.id).maybeSingle().then(({data,error})=>{
        if(!current)return;
        if(error||!data?.is_active||!data.province_id||!data.department){setProfile(null);setError('Tài khoản chưa được cấp quyền sử dụng.');}
        else setProfile(data as UserProfile);
        setLoading(false);
      });
    return()=>{current=false;};
  },[mode,session,revision]);
  const signOut=async()=>{
    const {error}=await supabase.auth.signOut();
    if(error)throw new Error('Chưa đăng xuất được. Vui lòng thử lại.');
    setSession(null);setProfile(null);
    setPasswordRecovery(false);
    window.dispatchEvent(new Event('appraisal:session-changed'));
  };
  const finishRecovery=()=>{setPasswordRecovery(false);if(window.location.pathname==='/auth/recovery')window.history.replaceState({},'', '/projects/appraisal');};
  return <AuthContext.Provider value={{mode,session,profile,loading,error,reload:()=>setRevision(n=>n+1),signOut,passwordRecovery,finishRecovery}}>{children}</AuthContext.Provider>;
}

export function useAuth(){const state=useContext(AuthContext);if(!state)throw new Error('AuthProvider is required');return state;}
