import {useEffect,useRef} from 'react';
import { useFilterState } from './useFilterState';
export function useColumnResize(key:string,fitWidth=false){
  const [widths,setWidths]=useFilterState<Record<number,number>>(key,{});
  const cleanup=useRef<(()=>void)|null>(null);
  useEffect(()=>()=>cleanup.current?.(),[]);
  const start=(index:number,event:React.PointerEvent)=>{event.preventDefault();event.stopPropagation();cleanup.current?.();
    const origin=event.clientX;const width=event.currentTarget.parentElement?.getBoundingClientRect().width||180;
    if(fitWidth){
      const cells=Array.from(event.currentTarget.closest('tr')?.children||[]);
      if(index>=cells.length-1)return;
      const current=cells.map(cell=>cell.getBoundingClientRect().width);
      const minimum=Math.min(80,(current[index]+current[index+1])/3);
      const move=(e:PointerEvent)=>{
        const delta=Math.max(minimum-current[index],Math.min(current[index+1]-minimum,e.clientX-origin));
        setWidths(Object.fromEntries(current.map((value,i)=>[i,value+(i===index?delta:i===index+1?-delta:0)])));
      };
      const stop=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop);window.removeEventListener('pointercancel',stop);cleanup.current=null;};
      cleanup.current=stop;
      window.addEventListener('pointermove',move);window.addEventListener('pointerup',stop,{once:true});window.addEventListener('pointercancel',stop,{once:true});
      return;
    }
    const move=(e:PointerEvent)=>setWidths(prev=>({...prev,[index]:Math.max(100,width+e.clientX-origin)}));
    const stop=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',stop);window.removeEventListener('pointercancel',stop);cleanup.current=null;};
      cleanup.current=stop;
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',stop,{once:true});window.addEventListener('pointercancel',stop,{once:true});};
  return {widths,start};
}
