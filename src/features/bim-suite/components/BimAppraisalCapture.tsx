import {useState} from 'react';
import {saveBlob} from '@/features/bim/services';
export function BimAppraisalCapture({viewer}:{engagementId:string;modelId:string|null;viewer:()=>{captureScreenshot:()=>string}|null;globalIds:()=>Promise<string[]>}) {
 const [busy,setBusy]=useState(false);
 return <button type="button" className="doc-button" disabled={busy} onClick={async()=>{setBusy(true);try{const data=viewer()?.captureScreenshot();if(data)saveBlob(await(await fetch(data)).blob(),'bim-appraisal-view.png');}finally{setBusy(false);}}}>Tải ảnh góc nhìn thẩm định</button>;
}
