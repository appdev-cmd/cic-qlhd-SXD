import React,{useEffect,useState,useRef} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Tooltip } from '../ui/Tooltip';
import { useChildFormGuard } from '../../hooks/useChildFormGuard';
import { useUnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard';
const modalStack:symbol[]=[];
export function ReviewModal({heading,children,onClose,dirty=false}:{heading:string;children:React.ReactNode;onClose:()=>void;dirty?:boolean}){
  const modalId=useRef(Symbol());const section=useRef<HTMLElement>(null);
  useEffect(()=>{modalStack.push(modalId.current);const previous=document.activeElement as HTMLElement;
    section.current?.focus();return()=>{const i=modalStack.indexOf(modalId.current);if(i>=0)modalStack.splice(i,1);previous?.focus();};},[]);
  useChildFormGuard(true);useUnsavedChangesGuard(dirty);const [discard,setDiscard]=useState(false);
  const close=()=>dirty?setDiscard(true):onClose();
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(modalStack[modalStack.length-1]!==modalId.current)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();if(dirty)setDiscard(true);else onClose();}
    if(e.key==='Tab'){const controls=section.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea,select,a[href],[tabindex="0"]');if(!controls?.length)return;const first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&(document.activeElement===first||document.activeElement===section.current)){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};
    window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);},[dirty,onClose]);
  return createPortal(<div className="fixed inset-0 z-[11000] bg-slate-950/70 p-4 flex items-center justify-center" onMouseDown={e=>{if(e.target===e.currentTarget&&!dirty)onClose();}}>
    <section ref={section} tabIndex={-1} role="dialog" aria-modal="true" aria-label={heading} className="relative w-full max-w-4xl max-h-[90vh] overflow-auto rounded-2xl bg-surface dark:bg-surface text-ink dark:text-ink shadow-2xl p-6">
      <h2 className="pr-16 mb-5 text-lg font-semibold">{heading}</h2><div className="absolute right-3 top-3"><Tooltip content="Đóng" placement="bottom"><button type="button" aria-label="Đóng cửa sổ" className="p-2" onClick={close}><X size={20}/></button></Tooltip></div>
      {discard?<div className="space-y-4"><p>Có thay đổi chưa lưu.</p><div className="flex gap-3"><button type="button" onClick={()=>setDiscard(false)} className="rounded-lg border p-2 dark:border-slate-800">Tiếp tục nhập</button><button type="button" onClick={onClose} className="rounded-lg bg-red-700 dark:bg-red-600 text-white dark:text-white p-2">Bỏ thay đổi và đóng</button></div></div>:children}
    </section>
  </div>,document.body);
}
