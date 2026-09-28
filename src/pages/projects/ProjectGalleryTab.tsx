import React, { useEffect, useMemo, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, Download, Plus } from 'lucide-react';
import type { Project, ProjectImage } from '../../data/mockData';
import { apiRequest } from '../../services/apiClient';
import { appraisalService } from '../../services/appraisalService';
import { ReviewModal } from '../../components/appraisal/ReviewModal';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { Tooltip } from '../../components/ui/Tooltip';
import { EntityLink } from '../../components/ui/EntityLink';
import { useAuth } from '../../context/AuthContext';
import { useFilterState } from '../../hooks/useFilterState';
import { formatDate } from '../../lib/utils';

type GalleryImage = ProjectImage & { storagePath?:string; sha256?:string };
type Gallery = { images:GalleryImage[]; revision:number };
const categories = [
  {value:'phoi_canh',label:'Phối cảnh 3D kiến trúc'},
  {value:'hien_trang',label:'Hiện trạng thực địa'},
  {value:'ban_ve',label:'Bản vẽ quy hoạch / Mặt bằng'},
  {value:'tien_do',label:'Tiến độ thi công'},
];
const initial = { title:'',url:'',category:'phoi_canh',description:'',file:null as File|null };
const button = 'rounded-lg border border-border dark:border-slate-800 bg-surface dark:bg-slate-800 px-3 py-2 text-ink dark:text-slate-100 disabled:opacity-50';
const input = 'w-full rounded-lg border border-border dark:border-slate-800 bg-subtle dark:bg-slate-900 px-3 py-2 text-ink dark:text-slate-100';

function ImageOriginal({ image, full=false }:{image:GalleryImage;full?:boolean}) {
  const [source,setSource] = useState('');
  const [error,setError] = useState(false);
  useEffect(()=>{
    let active=true, objectUrl='';setError(false);setSource('');
    if (!image.storagePath) { setSource(image.url);return; }
    appraisalService.blob(image.url.replace(/^\/api\/appraisal/,''))
      .then(blob=>{ objectUrl=URL.createObjectURL(blob);if(active)setSource(objectUrl);else URL.revokeObjectURL(objectUrl); })
      .catch(()=>{ if(active)setError(true); });
    return ()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[image.url,image.storagePath]);
  if(error)return <p role="alert" className="p-6 text-red-700 dark:text-red-300">Không tải được ảnh gốc.</p>;
  if(!source)return <p className="p-6 text-ink-muted dark:text-slate-400">Đang tải ảnh…</p>;
  return <img src={source} alt={image.title} onError={()=>setError(true)} loading={full?'eager':'lazy'} className={full?'mx-auto max-h-[65vh] max-w-full object-contain':'h-48 w-full object-cover'}/>;
}

function imageDate(value:string) {
  const legacy=value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return formatDate(legacy?`${legacy[3]}-${legacy[2].padStart(2,'0')}-${legacy[1].padStart(2,'0')}`:value);
}

export function ProjectGalleryTab({project}:{project:Project}) {
  const {mode,profile}=useAuth();
  const [gallery,setGallery]=useState<Gallery>({images:project.images||[],revision:1});
  const [category,setCategory]=useFilterState('project-gallery-filter',{category:'all'});
  const [selected,setSelected]=useState<string|null>(null);
  const [adding,setAdding]=useState(false);
  const [form,setForm]=useState(initial);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [version,setVersion]=useState(0);
  const path='/projects/'+encodeURIComponent(project.id)+'/images';
  useEffect(()=>{
    let active=true;setLoading(true);
    apiRequest<Gallery>(path).then(result=>{if(active){setGallery(result);setError('');}})
      .catch(cause=>{if(active)setError(cause.message);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[path,version]);
  const filtered=useMemo(()=>gallery.images.filter(image=>category.category==='all'||image.category===category.category),[gallery,category]);
  const index=filtered.findIndex(image=>image.id===selected);
  const activeImage=filtered[index];
  const dirty=JSON.stringify({...form,file:form.file?.name||null})!==JSON.stringify({...initial,file:null});
  const canAdd=mode==='demo'||['officer','head_of_department','admin'].includes(profile?.role||'');
  const close=()=>{if(!busy){setAdding(false);setForm(initial);}};
  const save=async(event:React.FormEvent)=>{
    event.preventDefault();if(busy)return;setBusy(true);setError('');
    try {
      if(form.file && (form.file.size>5*1024*1024 || !['image/jpeg','image/png','image/webp'].includes(form.file.type)))throw new Error('Chọn ảnh JPEG, PNG hoặc WebP tối đa 5 MB.');
      const contentBase64=form.file?await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Không đọc được tệp ảnh.'));reader.readAsDataURL(form.file!);}):undefined;
      const result=await apiRequest<Gallery>(path,{method:'POST',body:JSON.stringify({revision:gallery.revision,title:form.title,category:form.category,description:form.description,url:form.url,contentBase64})});
      setGallery(result);setAdding(false);setForm(initial);
    }catch(cause){setError((cause as Error).message);}finally{setBusy(false);}
  };
  const download=async(image:GalleryImage)=>{
    try {if(image.storagePath)await appraisalService.download(image.url.replace(/^\/api\/appraisal/,''),image.title);else window.open(image.url,'_blank','noopener,noreferrer');}
    catch(cause){setError((cause as Error).message);}
  };
  return <section className="space-y-5 text-sm text-ink dark:text-slate-100">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border dark:border-slate-800 bg-surface dark:bg-slate-900 p-4">
      <div><h3 className="flex items-center gap-2 font-bold"><Camera size={20}/>Thư viện ảnh dự án & khảo sát</h3><p className="mt-1 text-xs text-ink-muted dark:text-slate-400">{gallery.images.length} ảnh tư liệu · Người bổ sung được ghi nhận theo tài khoản.</p></div>
      <div className="flex gap-3"><button type="button" className={button} disabled={loading||busy} onClick={()=>setVersion(v=>v+1)}>Tải lại</button>{canAdd&&<button type="button" className={button} disabled={loading} onClick={()=>setAdding(true)}><Plus className="inline" size={15}/> Bổ sung ảnh</button>}</div>
    </header>
    {error&&<p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}
    <div className="max-w-sm"><SearchableSelect value={category.category} onChange={value=>{setCategory({category:value});setSelected(null);}} options={[{value:'all',label:'Tất cả ảnh'},...categories]}/></div>
    {loading?<p>Đang tải thư viện…</p>:filtered.length===0?<p className="p-8 text-center text-ink-muted dark:text-slate-400">Chưa có ảnh trong phân loại này.</p>:<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{filtered.map(image=><article key={image.id} className="overflow-hidden rounded-xl border border-border dark:border-slate-800 bg-surface dark:bg-slate-900">
      <button type="button" className="block w-full" aria-label={'Xem ảnh: '+image.title} onClick={()=>setSelected(image.id)}><ImageOriginal image={image}/></button>
      <div className="space-y-2 p-3"><h4 className="font-semibold">{image.title}</h4><p className="text-xs text-ink-muted dark:text-slate-400">{image.categoryLabel} · {imageDate(image.date)}</p><p className="text-xs">{image.author}</p><p className="text-xs text-ink-muted dark:text-slate-400">{image.description}</p></div>
    </article>)}</div>}
    {activeImage&&<ReviewModal heading={activeImage.title} onClose={()=>setSelected(null)}>
      <div className="space-y-4"><EntityLink type="project" id={project.id} name={project.name}/><ImageOriginal image={activeImage} full/>
        <div className="flex items-center justify-between gap-3"><Tooltip content="Ảnh trước"><button type="button" className={button} aria-label="Ảnh trước" disabled={filtered.length<2} onClick={()=>setSelected(filtered[(index-1+filtered.length)%filtered.length].id)}><ChevronLeft size={18}/></button></Tooltip><span>{index+1} / {filtered.length}</span><Tooltip content="Tải ảnh gốc"><button type="button" className={button} aria-label="Tải ảnh gốc" onClick={()=>download(activeImage)}><Download size={18}/></button></Tooltip><Tooltip content="Ảnh sau"><button type="button" className={button} aria-label="Ảnh sau" disabled={filtered.length<2} onClick={()=>setSelected(filtered[(index+1)%filtered.length].id)}><ChevronRight size={18}/></button></Tooltip></div>
        <p>{activeImage.description}</p><p className="text-xs text-ink-muted dark:text-slate-400">{activeImage.author} · {imageDate(activeImage.date)}</p>
      </div>
    </ReviewModal>}
    {adding&&<ReviewModal heading="Bổ sung ảnh dự án / khảo sát" dirty={dirty||busy} onClose={close}>
      <form onSubmit={save} className="space-y-4">
        <label className="block">Tiêu đề ảnh<input className={input} required maxLength={240} disabled={busy} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
        <label className="block">Phân loại<SearchableSelect disabled={busy} options={categories} value={form.category} onChange={category=>setForm({...form,category})}/></label>
        <label className="block">Tệp ảnh (JPEG, PNG, WebP; tối đa 5 MB)<input className={input} type="file" disabled={busy} accept="image/jpeg,image/png,image/webp" onChange={e=>setForm({...form,file:e.target.files?.[0]||null})}/></label>
        <label className="block">Hoặc liên kết ảnh HTTPS<input className={input} type="url" disabled={busy||!!form.file} required={!form.file} maxLength={2000} placeholder="https://…" value={form.url} onChange={e=>setForm({...form,url:e.target.value})}/></label>
        <label className="block">Mô tả<textarea className={input} disabled={busy} maxLength={2000} rows={3} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
        {error&&<p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}
        <button type="submit" className={button} disabled={busy}>{busy?'Đang lưu…':'Lưu ảnh tư liệu'}</button>
      </form>
    </ReviewModal>}
  </section>;
}
