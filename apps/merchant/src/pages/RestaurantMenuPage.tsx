import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState } from '@nexoio/ui';
import { PageHeader } from '../components/PageHeader';
import { Field, Modal } from '../components/Modal';
import { api, ApiError } from '../lib/api';
import { RestaurantCatalogSettingsPanel } from './RestaurantCatalogSettingsPanel';
import './restaurant-operations.css';
import './restaurant-menu.css';

type Product={id:string;name:string;sku?:string|null;description?:string|null;sale_price:number|string;minimum_stock?:number|string|null;stock_control_enabled?:boolean;active:boolean;primary_image_file_id?:string|null;image_url?:string|null};
type Station={id:string;name:string;station_type:string;active:boolean};
type ProductRoute={product_id:string;station_id:string;station_name:string;station_type:string;active:boolean};
const brl=(v:number|string|undefined)=>Number(v??0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fail=(e:unknown,fallback:string)=>e instanceof ApiError?e.message:fallback;

export function RestaurantMenuPage(){
  const[items,setItems]=useState<Product[]>([]);const[stations,setStations]=useState<Station[]>([]);const[routes,setRoutes]=useState<ProductRoute[]>([]);const[loading,setLoading]=useState(true);const[error,setError]=useState('');const[open,setOpen]=useState(false);const[editing,setEditing]=useState<Product|null>(null);const[saving,setSaving]=useState(false);const[filter,setFilter]=useState<'all'|'active'|'inactive'>('all');
  const load=useCallback(async()=>{setLoading(true);setError('');try{const[p,s,r]=await Promise.all([api.get<{data:Product[]}>('/api/v1/menu/products'),api.get<{data:Station[]}>('/api/v1/restaurant/production/stations'),api.get<{data:ProductRoute[]}>('/api/v1/restaurant/production/product-routes')]);setItems(p.data);setStations(s.data.filter(x=>x.active));setRoutes(r.data.filter(x=>x.active))}catch(e){setError(fail(e,'Não foi possível carregar o cardápio.'))}finally{setLoading(false)}},[]);
  useEffect(()=>{void load()},[load]);
  const visible=useMemo(()=>filter==='all'?items:items.filter(x=>filter==='active'?x.active:!x.active),[items,filter]);
  const routeNames=(productId:string)=>routes.filter(x=>x.product_id===productId).map(x=>x.station_name);
  const routeIds=(productId?:string)=>new Set(productId?routes.filter(x=>x.product_id===productId).map(x=>x.station_id):[]);
  const openCreate=()=>{setEditing(null);setOpen(true)};const openEdit=(p:Product)=>{setEditing(p);setOpen(true)};
  const submit=async(e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();const f=new FormData(e.currentTarget);setSaving(true);setError('');try{
    const stockControlEnabled=f.get('stockControlEnabled')==='on';const stationIds=f.getAll('stationIds').map(String);
    const payload={name:String(f.get('name')||'').trim(),sku:String(f.get('sku')||'').trim()||undefined,description:String(f.get('description')||'').trim()||undefined,salePrice:Number(f.get('salePrice')||0),minimumStock:Number(f.get('minimumStock')||0),stockControlEnabled,active:editing?.active??true};
    let id=editing?.id;
    if(editing)await api.patch(`/api/v1/menu/products/${editing.id}`,payload);else{const created=await api.post<{data:{id:string}}>('/api/v1/menu/products',payload);id=created.data.id;}
    if(id)await api.put(`/api/v1/restaurant/production/products/${id}/routes`,{stationIds});
    const image=f.get('image');if(id&&image instanceof File&&image.size>0){const form=new FormData();form.set('file',image);await api.upload(`/api/v1/menu/products/${id}/image`,form);}
    setOpen(false);setEditing(null);await load();
  }catch(err){setError(fail(err,'Não foi possível salvar o item do cardápio.'))}finally{setSaving(false)}};
  const deactivate=async(p:Product)=>{if(!confirm(`Remover "${p.name}" do cardápio? O histórico de vendas será preservado.`))return;setError('');try{await api.delete(`/api/v1/menu/products/${p.id}`);await load()}catch(e){setError(fail(e,'Não foi possível remover o item do cardápio.'))}};
  const reactivate=async(p:Product)=>{setError('');try{await api.patch(`/api/v1/menu/products/${p.id}`,{active:true});await load()}catch(e){setError(fail(e,'Não foi possível reativar o item.'))}};
  return <>
    <PageHeader title="Cardápio" description="Itens, preços, fotos, estoque, produção e configuração comercial em um só lugar." action={<Button onClick={openCreate}>Novo item</Button>}/>
    <section className="menu-panel"><div className="menu-panel-head"><h2>Itens do Cardápio</h2><div className="restaurant-toolbar"><button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>Todos</button><button className={filter==='active'?'active':''} onClick={()=>setFilter('active')}>Ativos</button><button className={filter==='inactive'?'active':''} onClick={()=>setFilter('inactive')}>Inativos</button><button onClick={()=>void load()}>Atualizar</button></div></div>
      {error?<div className="auth-notice error" role="alert">{error}</div>:null}
      {loading?<div className="restaurant-loading">Carregando cardápio…</div>:visible.length?<div className="menu-card-grid">{visible.map((p,i)=>{const destinations=routeNames(p.id);return <article className={`menu-item-card ${p.active?'':'menu-item-inactive'}`} key={p.id}>
        <div className="menu-thumb">{p.image_url?<img src={p.image_url} alt={p.name}/>:<span>{(p.name||'?').slice(0,2).toUpperCase()}</span>}</div>
        <div><small>{p.sku||`C${String(i+1).padStart(2,'0')}`}</small><h3>{p.name}</h3><p>{p.description||'Item do cardápio'}</p><small>{p.stock_control_enabled?'Estoque controlado':'Sem controle de estoque'}</small><div className="menu-route-tags">{destinations.length?destinations.map(name=><span key={name}>{name}</span>):<span>Cozinha padrão</span>}</div></div>
        <div className="menu-price-row"><strong>{brl(p.sale_price)}</strong><span className={p.active?'menu-active':'menu-inactive'}>● {p.active?'Ativo':'Inativo'}</span></div>
        <div className="menu-card-actions"><button onClick={()=>openEdit(p)}>Editar</button>{p.active?<button className="danger" onClick={()=>void deactivate(p)}>Excluir do cardápio</button>:<button onClick={()=>void reactivate(p)}>Reativar</button>}</div>
      </article>})}</div>:<EmptyState title="Nenhum item no cardápio" description="Cadastre produtos com foto, preço e destino de produção." action={<Button onClick={openCreate}>Novo item</Button>}/>}</section>
    <RestaurantCatalogSettingsPanel/>
    <Modal open={open} onClose={()=>!saving&&(setOpen(false),setEditing(null))} onSubmit={submit} title={editing?'Editar item':'Novo item'} description="Defina também para quais setores este item será enviado ao confirmar um pedido." submitLabel={saving?'Salvando…':'Salvar'}>
      <Field label="Nome" name="name"><input name="name" defaultValue={editing?.name??''} required/></Field>
      <Field label="SKU" name="sku"><input name="sku" defaultValue={editing?.sku??''}/></Field>
      <Field label="Descrição" name="description"><textarea name="description" defaultValue={editing?.description??''} rows={3}/></Field>
      <Field label="Preço" name="salePrice"><input name="salePrice" type="number" min="0" step="0.01" defaultValue={editing?.sale_price??''} required/></Field>
      <Field label="Estoque mínimo" name="minimumStock"><input name="minimumStock" type="number" min="0" step="1" defaultValue={editing?.minimum_stock??0}/></Field>
      <Field label={editing?.image_url?'Trocar foto':'Foto do item'} name="image"><input name="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif"/></Field>
      <label className="nx-field"><span className="nx-field-label">Controle de estoque</span><span className="menu-stock-toggle"><input name="stockControlEnabled" type="checkbox" defaultChecked={editing?.stock_control_enabled??false}/><span>Baixar saldo físico deste item ao fechar a venda</span></span></label>
      <div className="menu-production-routing"><strong>Destino de produção</strong><p>Marque todos os setores que precisam receber este item. Ex.: um combo pode ir para Bar e Cozinha.</p>{stations.length?<div>{stations.map(station=><label key={station.id}><input type="checkbox" name="stationIds" value={station.id} defaultChecked={routeIds(editing?.id).has(station.id)}/><span>{station.name}</span><small>{station.station_type}</small></label>)}</div>:<small>Sem estações cadastradas. O item será enviado para Cozinha por padrão; cadastre Bar/Fritadeira em Configurações.</small>}</div>
      <small className="menu-upload-help">Para pratos preparados e lanches, normalmente deixe controle de estoque desativado; ingredientes/insumos devem ser tratados pela ficha técnica.</small>
      <small className="menu-upload-help">JPG, PNG, WEBP, GIF ou AVIF. Máximo de 10 MB.</small>
    </Modal>
  </>;
}
