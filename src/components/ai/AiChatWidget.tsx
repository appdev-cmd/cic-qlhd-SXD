import React,{useState} from 'react';
import {Bot} from 'lucide-react';
import {Tooltip} from '../ui/Tooltip';
import {ReviewModal} from '../appraisal/ReviewModal';
import {LegalAssistant} from './LegalAssistant';
export function AiChatWidget(){const [open,setOpen]=useState(false);const [dirty,setDirty]=useState(false);return <><div className="fixed bottom-5 right-5 z-40"><Tooltip content="Tra cứu pháp luật với AI" placement="top"><button aria-label="Trợ lý AI Pháp luật" onClick={()=>setOpen(true)} className="rounded-full bg-primary-600 dark:bg-primary-500 p-3 text-white dark:text-white shadow-lg"><Bot size={24}/></button></Tooltip></div>{open&&<ReviewModal dirty={dirty} heading="Trợ lý AI Pháp luật" onClose={()=>setOpen(false)}><LegalAssistant onDirtyChange={setDirty}/></ReviewModal>}</>;}
