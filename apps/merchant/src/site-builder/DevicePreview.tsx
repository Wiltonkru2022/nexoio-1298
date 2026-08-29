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
  return <div className="preview-browser preview-exact" style={{position:'relative',minHeight:720,overflow:'hidden'}}>{loading?<div style={{position:'absolute',zIndex:2,top:12,right:12,padding:'6px 10px',borderRadius:999,background:'#fff',boxShadow:'0 4px 18px #0002',fontSize:12}}>Atualizando prévia…</div>:null}{html?<iframe title="Prévia exata do site" srcDoc={html} sandbox="" style={{display:'block',width:'100%',height:720,border:0,background:'#fff'}}/>:<div style={{padding:24}}>Não foi possível gerar a prévia.</div>}</div>;
}
