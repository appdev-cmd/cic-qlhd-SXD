import React,{useEffect,useState} from 'react';
import {Building2,ShieldCheck,FolderKanban,FileText,ScanText,User,Lock,Eye,EyeOff,Sun,Moon,Leaf,ArrowRight,LoaderCircle,ArrowLeft} from 'lucide-react';
import {supabase,remembersSession,setRememberSession} from '../../lib/supabase';
import {useAuth} from '../../context/AuthContext';
import {useTheme,PRIMARY_COLORS} from '../../context/ThemeContext';
import {SearchableSelect} from '../ui/SearchableSelect';
import {Tooltip} from '../ui/Tooltip';

type TestAccount={role:string;label:string;description:string};
const field='flex items-center gap-3 rounded-xl border border-border dark:border-slate-700 bg-subtle dark:bg-slate-900 px-3.5 py-3 focus-within:border-primary-500 dark:focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-500/20';
const textInput='w-full min-w-0 bg-transparent dark:bg-transparent text-sm text-ink dark:text-slate-100 outline-none placeholder:text-ink-muted dark:placeholder:text-slate-400 disabled:opacity-60';
const primary='w-full flex items-center justify-center gap-2 rounded-xl bg-primary-500 dark:bg-primary-500 px-4 py-3 text-sm font-bold text-white dark:text-white hover:bg-primary-600 dark:hover:bg-primary-600 disabled:opacity-60 transition-colors';
const features=[
  {icon:FolderKanban,title:'Hồ sơ gắn liền với dự án',text:'Theo dõi các lần nộp và tài liệu của từng công trình.'},
  {icon:ShieldCheck,title:'Ba nghiệp vụ chuyên môn',text:'Thẩm định BCNCKT, cấp phép xây dựng và kiểm tra nghiệm thu.'},
  {icon:ScanText,title:'AI hỗ trợ có dẫn chứng',text:'Đối chiếu dữ liệu, xem nguồn và ghi nhận đánh giá của chuyên viên.'},
  {icon:FileText,title:'Lịch sử và dự thảo kết quả',text:'Lưu quá trình xử lý, quản lý bản gốc và xuất văn bản A4.'},
];
function Brand({large=false}:{large?:boolean}){
  return <div className={(large?'h-20 w-20 rounded-2xl':'h-12 w-12 rounded-xl')+' flex flex-col items-center justify-center bg-primary-500 dark:bg-primary-500 text-white dark:text-white shadow-sm'}><Building2 size={large?32:22}/><span className={(large?'text-sm':'text-[9px]')+' font-black tracking-widest mt-1'}>SXD</span></div>;
}

export function RequireAuth({children}:{children:React.ReactNode}){
  const auth=useAuth();const {theme,setTheme,primaryColor,setPrimaryColor}=useTheme();
  const [email,setEmail]=useState(()=>localStorage.getItem('buildappraisal-login-email')||'');
  const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');const [showPassword,setShowPassword]=useState(false);
  const [remember,setRemember]=useState(remembersSession);const [forgot,setForgot]=useState(false);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const [accounts,setAccounts]=useState<TestAccount[]>([]);const [selected,setSelected]=useState('');
  useEffect(()=>{if(auth.mode!=='cloud')return;let active=true;
    fetch('/api/appraisal/test-login/accounts').then(async r=>r.ok?r.json():{accounts:[]}).then(data=>{if(active)setAccounts(data.accounts||[]);}).catch(()=>{if(active)setAccounts([]);});
    return()=>{active=false;};},[auth.mode]);
  const action=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  const loginEmail=()=>email.trim().includes('@')?email.trim():email.trim()+'@cic.com.vn';
  const quickLogin=(role:string)=>{setSelected(role);void action(async()=>{
    setRememberSession(remember);
    const response=await fetch('/api/appraisal/test-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role})});
    const result=await response.json();if(!response.ok)throw new Error(typeof result.detail==='string'?result.detail:'Chưa đăng nhập được.');
    const {error}=await supabase.auth.setSession(result);if(error)throw new Error('Không tạo được phiên đăng nhập.');setPassword('');
  });};
  const submit=()=>action(async()=>{
    if(auth.passwordRecovery){if(password!==confirm)throw new Error('Hai mật khẩu chưa khớp.');const {error}=await supabase.auth.updateUser({password});if(error)throw new Error('Không đổi được mật khẩu. Kiểm tra yêu cầu mật khẩu hoặc mở lại liên kết khôi phục.');setPassword('');setConfirm('');auth.finishRecovery();return;}
    if(forgot){const {error}=await supabase.auth.resetPasswordForEmail(loginEmail(),{redirectTo:window.location.origin+'/auth/recovery'});if(error)throw new Error('Chưa gửi được liên kết. Vui lòng thử lại sau.');setNotice('Nếu email có tài khoản, anh/chị sẽ nhận liên kết khôi phục. Vui lòng kiểm tra hộp thư.');return;}
    setRememberSession(remember);if(remember)localStorage.setItem('buildappraisal-login-email',email.trim());else localStorage.removeItem('buildappraisal-login-email');
    const {error}=await supabase.auth.signInWithPassword({email:loginEmail(),password});if(error)throw new Error('Tài khoản hoặc mật khẩu không đúng.');setPassword('');
  });
  if(!auth.passwordRecovery&&(auth.mode==='demo'||auth.profile))return <>{children}</>;
  const recovery=auth.passwordRecovery;
  const showForm=!auth.loading&&((auth.mode==='cloud'&&!auth.session&&!recovery)||(recovery&&auth.session));
  return <main className="min-h-screen lg:h-screen lg:overflow-hidden grid lg:grid-cols-2 bg-page dark:bg-slate-900 text-ink dark:text-slate-100">
    <aside className="hidden lg:flex flex-col justify-between gap-8 border-r border-border dark:border-slate-800 bg-subtle dark:bg-slate-950 p-10 xl:p-14 overflow-y-auto">
      <div className="flex items-center gap-4"><Brand/><div><p className="text-lg font-black tracking-wider">BUILD<span className="text-primary-600 dark:text-primary-400">APPRAISAL AI</span></p><p className="mt-1 text-[10px] uppercase font-semibold tracking-wider text-ink-muted dark:text-slate-400">Hệ thống nghiệp vụ Sở Xây dựng</p></div></div>
      <div className="py-4"><h1 className="text-4xl xl:text-5xl font-black leading-[1.15] tracking-tight">Quản lý xây dựng.<br/><span className="text-primary-600 dark:text-primary-400">Hỗ trợ thẩm định dự án.</span></h1><p className="mt-5 max-w-lg text-base leading-relaxed text-ink-secondary dark:text-slate-300">Kết nối dự án, hồ sơ và dữ liệu. Hỗ trợ chuyên viên rà soát từ tiếp nhận đến dự thảo kết quả.</p>
        <div className="mt-8 space-y-3">{features.map(({icon:Icon,title,text})=><article key={title} className="flex gap-4 rounded-2xl border border-border dark:border-slate-800 bg-surface dark:bg-slate-900 p-4"><Icon size={23} className="mt-1 shrink-0 text-primary-600 dark:text-primary-400"/><div><h2 className="text-sm font-bold">{title}</h2><p className="mt-1 text-xs leading-relaxed text-ink-muted dark:text-slate-400">{text}</p></div></article>)}</div>
      </div>
      <p className="text-[10px] tracking-wider uppercase font-semibold text-ink-muted dark:text-slate-400">Sở Xây dựng tỉnh Điện Biên · BuildAppraisal AI</p>
    </aside>
    <section className="relative flex flex-col lg:h-screen lg:overflow-y-auto px-6 sm:px-12 py-6">
      <div className="flex flex-wrap justify-end gap-3 mb-8" aria-label="Tùy chọn giao diện đăng nhập">
        <div className="flex items-center gap-2 rounded-full border border-border dark:border-slate-700 bg-surface dark:bg-slate-800 px-3 py-2">
          {PRIMARY_COLORS.slice(0,3).map(color=><Tooltip key={color.id} content={color.name} placement="bottom"><button type="button" aria-label={color.name} aria-pressed={primaryColor===color.id} onClick={()=>setPrimaryColor(color.id)} className={'h-5 w-5 rounded-full border-2 '+(primaryColor===color.id?'border-ink dark:border-white ring-2 ring-offset-2 ring-primary-300 dark:ring-primary-400 dark:ring-offset-slate-800':'border-transparent dark:border-transparent')} style={{backgroundColor:color.hex}}/></Tooltip>)}
        </div>
        <div className="flex gap-1 rounded-full border border-border dark:border-slate-700 bg-surface dark:bg-slate-800 p-1">
          {([{value:'light',label:'Sáng',icon:Sun},{value:'nature',label:'Bảo vệ mắt',icon:Leaf},{value:'dark',label:'Tối',icon:Moon}] as const).map(({value,label,icon:Icon})=><Tooltip key={value} content={label} placement="bottom"><button type="button" aria-label={'Giao diện '+label} aria-pressed={theme===value} onClick={()=>setTheme(value)} className={'rounded-full p-2 transition-colors '+(theme===value?'bg-primary-500 dark:bg-primary-500 text-white dark:text-white':'text-ink-muted dark:text-slate-400 hover:bg-subtle dark:hover:bg-slate-900')}><Icon size={16}/></button></Tooltip>)}
        </div>
      </div>
      <div className="w-full max-w-[440px] mx-auto my-auto py-5">
        <header className="text-center flex flex-col items-center gap-2 mb-7"><Brand large/><p className="mt-3 text-xs uppercase tracking-[0.15em] font-bold text-ink-muted dark:text-slate-400">UBND tỉnh Điện Biên</p><h2 className="text-xl font-black tracking-wider uppercase">Sở Xây dựng</h2><p className="text-[10px] uppercase tracking-[0.16em] text-ink-muted dark:text-slate-400">Hệ thống thẩm định dự án xây dựng</p></header>
        <div className="flex items-center gap-4 mb-6"><span className="h-px flex-1 bg-border dark:bg-slate-700"/><h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted dark:text-slate-400">{recovery?'Đặt mật khẩu mới':forgot?'Khôi phục mật khẩu':'Đăng nhập hệ thống'}</h3><span className="h-px flex-1 bg-border dark:bg-slate-700"/></div>
        {(error||auth.error)&&<p role="alert" className="mb-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-200">{error||auth.error}</p>}
        {notice&&<p role="status" className="mb-4 rounded-xl border border-primary-200 dark:border-primary-700 bg-primary-50 dark:bg-slate-800 p-3 text-sm text-primary-700 dark:text-primary-300">{notice}</p>}
        {auth.loading&&<p role="status" className="flex items-center justify-center gap-2 text-sm text-ink-muted dark:text-slate-400"><LoaderCircle size={18} className="animate-spin"/>Đang kết nối…</p>}
        {showForm&&<form className="space-y-4" onSubmit={e=>{e.preventDefault();void submit();}}>
          {!recovery&&<label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted dark:text-slate-400">Tài khoản hoặc Email<div className={field+' mt-2'}><User size={17} className="shrink-0"/><input aria-label="Tài khoản hoặc Email" required autoComplete="username" className={textInput} placeholder="appdev hoặc ten@cic.com.vn" value={email} onChange={e=>setEmail(e.target.value)} disabled={busy}/></div></label>}
          {(!forgot||recovery)&&<label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted dark:text-slate-400">{recovery?'Mật khẩu mới':'Mật khẩu'}<div className={field+' mt-2'}><Lock size={17} className="shrink-0"/><input aria-label={recovery?'Mật khẩu mới':'Mật khẩu'} className={textInput} type={showPassword?'text':'password'} autoComplete={recovery?'new-password':'current-password'} required minLength={recovery?12:undefined} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} placeholder={recovery?'Ít nhất 12 ký tự':'Nhập mật khẩu'} disabled={busy}/><Tooltip content={showPassword?'Ẩn mật khẩu':'Hiện mật khẩu'} placement="top"><button type="button" aria-label={showPassword?'Ẩn mật khẩu':'Hiện mật khẩu'} onClick={()=>setShowPassword(v=>!v)} className="p-1 text-ink-muted dark:text-slate-400">{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></Tooltip></div></label>}
          {recovery&&<label className="block text-[11px] font-bold uppercase tracking-wider text-ink-muted dark:text-slate-400">Nhập lại mật khẩu<div className={field+' mt-2'}><Lock size={17}/><input aria-label="Nhập lại mật khẩu" className={textInput} type="password" autoComplete="new-password" required value={confirm} onChange={e=>setConfirm(e.target.value)}/></div></label>}
          {!forgot&&!recovery&&<div className="flex items-center justify-between gap-3 text-xs"><label className="flex items-center gap-2 cursor-pointer text-ink-muted dark:text-slate-400"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)} className="accent-primary-500 dark:accent-primary-400"/>Ghi nhớ đăng nhập</label><button type="button" onClick={()=>{setForgot(true);setError('');setNotice('');}} className="font-semibold text-primary-600 dark:text-primary-400">Quên mật khẩu?</button></div>}
          <button className={primary} disabled={busy}>{busy?<><LoaderCircle size={17} className="animate-spin"/>Đang xử lý…</>:<>{recovery?'Lưu mật khẩu mới':forgot?'Gửi liên kết khôi phục':'Đăng nhập'}<ArrowRight size={16}/></>}</button>
        </form>}
        {!auth.loading&&recovery&&!auth.session&&<div className="space-y-4 text-sm"><p>Liên kết khôi phục không hợp lệ hoặc đã hết hạn.</p><button className={primary} onClick={()=>{auth.finishRecovery();setForgot(true);}}>Yêu cầu liên kết mới</button></div>}
        {!recovery&&showForm&&(forgot?<button type="button" className="mt-4 flex items-center gap-2 text-xs text-primary-600 dark:text-primary-400" onClick={()=>{setForgot(false);setError('');setNotice('');}}><ArrowLeft size={15}/>Quay lại đăng nhập</button>:accounts.length>0&&<div className="mt-6 pt-5 border-t border-border dark:border-slate-700"><p className="text-center text-[10px] font-bold uppercase tracking-wider text-ink-muted dark:text-slate-400 mb-3">Hoặc đăng nhập bằng tài khoản thử nghiệm</p><SearchableSelect value={selected} onChange={quickLogin} disabled={busy} placeholder="Chọn vai trò để đăng nhập ngay" options={accounts.map(a=>({value:a.role,label:a.label,sublabel:a.description,badge:'TEST'}))}/><p className="text-center text-[11px] text-ink-muted dark:text-slate-400 mt-3">Chọn tài khoản để vào thẳng môi trường thử nghiệm.</p></div>)}
        {!auth.loading&&!showForm&&!recovery&&<div className="space-y-3"><button onClick={auth.reload} className={primary}>Thử kết nối lại</button>{auth.session&&<button onClick={()=>void action(auth.signOut)} className="w-full text-sm text-primary-600 dark:text-primary-400">Đổi tài khoản</button>}</div>}
        <footer className="mt-8 text-center text-[10px] text-ink-muted dark:text-slate-400">BuildAppraisal AI · Hỗ trợ nghiệp vụ quản lý xây dựng</footer>
      </div>
    </section>
  </main>;
}
