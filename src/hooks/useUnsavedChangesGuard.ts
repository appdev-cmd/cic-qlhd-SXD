import { useEffect } from 'react';
import { useChildFormGuard } from './useChildFormGuard';
export function useUnsavedChangesGuard(isDirty:boolean){
  useChildFormGuard(isDirty);
  useEffect(()=>{if(!isDirty)return;const guard=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};
    window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[isDirty]);
}
