import React,{lazy,Suspense} from 'react';
import { useSlidePanel } from '../context/SlidePanelContext';
const EntityPreview=lazy(()=>import('../components/ui/EntityPreview').then(module=>({default:module.EntityPreview})));

export function useEntityPanel(){
  const {openPanel}=useSlidePanel();
  return {open:(type:'project'|'organization'|'personnel'|'dossier',entity:{id:string;name?:string})=>{
    const name=entity.name||'Chi tiết hồ sơ';
    openPanel({id:type+'-'+entity.id,title:name,tabTitle:name,storageKey:'entity-'+type,
      component:<Suspense fallback={<p className="text-ink dark:text-ink">Đang tải…</p>}><EntityPreview type={type} id={entity.id}/></Suspense>});
  }};
}
