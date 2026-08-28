import { useEffect, useState } from 'react';
import { EmptyState, Pill, SectionTitle } from '@nexoio/ui';
import { adminApi } from './lib/api';
const definitions:Record<string,{endpoint:string;title:string;description:string}>={
  '/assinaturas':{endpoint:'subscriptions',title:'Assinaturas',description:'Planos e períodos contratados pelas empresas.'},
  '/dominios':{endpoint:'domains',title:'Domínios',description:'Verificação e segurança dos domínios próprios.'},
  '/sites':{endpoint:'sites',title:'Sites públicos',description:'Publicação e endereço público de cada empresa.'},
  '/usuarios':{endpoint:'users',title:'Usuários',description:'Contas, confirmação de e-mail e proteção em duas etapas.'},
  '/modulos':{endpoint:'modules',title:'Módulos',description:'Catálogo global de recursos da plataforma.'},
  '/templates':{endpoint:'templates',title:'Modelos de site',description:'Modelos versionados disponíveis no editor visual.'},
};
export function AdminResourcePage({path}:{path:string}){const definition=definitions[path]!;const[rows,setRows]=useState<Array<Record<string,unknown>>>([]);const[error,setError]=useState('');useEffect(()=>{adminApi.get<{data:Array<Record<string,unknown>>}>(`/api/v1/admin/${definition.endpoint}`).then(result=>setRows(result.data)).catch(reason=>setError(reason instanceof Error?reason.message:'Falha ao carregar'))},[definition.endpoint]);const label=(value:unknown)=>value===true?'Sim':value===false?'Não':value instanceof Date?value.toLocaleString('pt-BR'):String(value??'—');return <section className="panel"><SectionTitle title={definition.title} description={definition.description}/>{error?<p role="alert">{error}</p>:rows.length?<div className="table-shell"><table className="admin-table"><thead><tr>{Object.keys(rows[0]!).slice(0,6).map(key=><th key={key}>{key.replace(/([A-Z])/g,' $1')}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={String(row.id??row.businessId??index)}>{Object.entries(row).slice(0,6).map(([key,value])=><td key={key}>{key.toLowerCase().includes('status')?<Pill>{label(value)}</Pill>:label(value)}</td>)}</tr>)}</tbody></table></div>:<EmptyState title="Nenhum registro" description="Ainda não existem dados nesta área."/>}</section>}
export const adminResourcePaths=new Set(Object.keys(definitions));
