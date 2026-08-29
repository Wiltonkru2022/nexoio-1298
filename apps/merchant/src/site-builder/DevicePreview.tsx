import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { SiteEditor, SitePage } from './types';
import './template-preview.css';

export function DevicePreview({editor,page}:{editor:SiteEditor;page:SitePage;selected:string|null;select:(id:string)=>void}){
  const [html,setHtml]=useState('');
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    let cancelled=false;setLoading(true);
    const timer=window.setTimeout(()=>{
      api.post<{data:{html:string}}>('/api/v1/site-preview/render',{...editor,activePageId:page.id}).then(result=>{if(!cancelled)setHtml(result.data.html)}).catch(()=>{if(!cancelled)setHtml('')}).finally(()=>{if(!cancelled)setLoading(false)});
    },250);
    return()=>{cancelled=true;window.clearTimeout(timer)};
  },[editor,page.id]);
  return <div className="preview-browser preview-exact">{loading?<div className="preview-render-status">Atualizando prévia…</div>:null}{html?<iframe title="Prévia exata do site" srcDoc={html} sandbox="" className="preview-render-frame"/>:<div className="preview-render-status">Não foi possível gerar a prévia.</div>}</div>;
}
