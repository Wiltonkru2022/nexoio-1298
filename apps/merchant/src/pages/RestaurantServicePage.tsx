import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, EmptyState } from '@nexoio/ui';
import { PageHeader } from '../components/PageHeader';
import { api, ApiError } from '../lib/api';
import './restaurant-service.css';

type Product={id:string;name:string;description?:string|null;sale_price:number|string;active:boolean;image_url?:string|null;categories?:string[]};
type OrderItem={id:string;description:string;quantity:number|string;total:number|string;notes?:string|null;status?:string};
type Order={id:string;tab_id?:string|null;table_id?:string|null;channel:string;status:string;payment_status?:string;fulfillment_status?:string;total:number|string;created_at?:string;items?:OrderItem[]};
type TableRow={id:string;number:string;status:string};
type Check={id:string;code:string;table_id:string|null;table_number:string|null;customer_name?:string|null;guest_count?:number;total:number|string;paid?:number|string;due?:number|string;opened_at?:string};
type CartLine={productId:string;name:string;unitPrice:number;quantity:number;notes:string;imageUrl?:string|null};
type Channel='table'|'counter'|'pickup'|'delivery';

const brl=(value:number|string|undefined)=>Number(value??0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const elapsed=(date?:string)=>{if(!date)return'agora';const m=Math.max(0,Math.floor((Date.now()-new Date(date).getTime())/60000));return m<60?`${m} min`:`${Math.floor(m/60)}h ${m%60}min`;};
const fail=(reason:unknown,fallback:string)=>reason instanceof ApiError?reason.message:fallback;
const go=(path:string)=>{history.pushState({},'',path);window.dispatchEvent(new PopStateEvent('popstate'));scrollTo({top:0,behavior:'smooth'});};

export function RestaurantServicePage(){
  const params=useMemo(()=>new URLSearchParams(location.search),[]);
  const tableId=params.get('tableId')??'';const tabId=params.get('tabId')??'';const requested=params.get('channel');const channel:Channel=tableId?'table':requested==='pickup'||requested==='delivery'||requested==='counter'?requested:'counter';
  const from=params.get('from')==='comandas'?'comandas':params.get('from')==='pedidos'?'pedidos':params.get('from')==='delivery'?'delivery':params.get('from')==='retirada'?'retirada':'mesas';
  const[products,setProducts]=useState<Product[]>([]);const[orders,setOrders]=useState<Order[]>([]);const[tables,setTables]=useState<TableRow[]>([]);const[checks,setChecks]=useState<Check[]>([]);
  const[cart,setCart]=useState<CartLine[]>([]);const[query,setQuery]=useState('');const[category,setCategory]=useState('Todos');const[loading,setLoading]=useState(true);const[saving,setSaving]=useState(false);const[error,setError]=useState('');
  const[recipientName,setRecipientName]=useState('');const[recipientPhone,setRecipientPhone]=useState('');const[address,setAddress]=useState('');const[deliveryFee,setDeliveryFee]=useState('0');
  const serviceKey=tabId||tableId||`${channel}-new`;const storageKey=`nexoio.restaurant.cart.${serviceKey}`;

  const load=useCallback(async()=>{setLoading(true);setError('');try{const[p,o,t,c]=await Promise.all([api.get<{data:Product[]}>('/api/v1/menu/products'),api.get<{data:Order[]}>('/api/v1/orders'),api.get<{data:TableRow[]}>('/api/v1/tables'),api.get<{data:Check[]}>('/api/v1/restaurant/checks')]);setProducts(p.data.filter(x=>x.active));setOrders(o.data);setTables(t.data);setChecks(c.data)}catch(reason){setError(fail(reason,'Não foi possível carregar o atendimento.'))}finally{setLoading(false)}},[]);
  useEffect(()=>{void load()},[load]);
  useEffect(()=>{try{const raw=sessionStorage.getItem(storageKey);if(raw)setCart(JSON.parse(raw) as CartLine[])}catch{/* ignore invalid local draft */}},[storageKey]);
  useEffect(()=>{try{if(cart.length)sessionStorage.setItem(storageKey,JSON.stringify(cart));else sessionStorage.removeItem(storageKey)}catch{/* storage unavailable */}},[cart,storageKey]);

  const table=tables.find(x=>x.id===tableId);const check=checks.find(x=>x.id===tabId)||(tableId?checks.find(x=>x.table_id===tableId):undefined);
  const accountOrders=orders.filter(o=>tabId?o.tab_id===tabId:tableId?o.table_id===tableId&&!o.tab_id:false).sort((a,b)=>new Date(a.created_at??0).getTime()-new Date(b.created_at??0).getTime());
  const openOrders=accountOrders.filter(o=>!['closed','cancelled'].includes(o.status));
  const accountTotal=accountOrders.filter(o=>o.status!=='cancelled').reduce((sum,o)=>sum+Number(o.total??0),0);
  const paidTotal=Math.max(0,accountTotal-Number(check?.due??accountTotal));
  const cartTotal=cart.reduce((sum,line)=>sum+line.unitPrice*line.quantity,0);
  const categories=useMemo(()=>['Todos',...Array.from(new Set(products.flatMap(p=>p.categories??[]))).sort((a,b)=>a.localeCompare(b,'pt-BR'))],[products]);
  const visibleProducts=products.filter(p=>{const q=query.trim().toLocaleLowerCase('pt-BR');const matchesQuery=!q||p.name.toLocaleLowerCase('pt-BR').includes(q)||(p.description??'').toLocaleLowerCase('pt-BR').includes(q);const matchesCategory=category==='Todos'||(p.categories??[]).includes(category);return matchesQuery&&matchesCategory;});
  const title=tabId||check?`${table?.number?`Mesa ${table.number} · `:''}Comanda ${check?.code??params.get('command')??''}`:tableId?`Mesa ${table?.number??'—'}`:channel==='pickup'?'Nova retirada':channel==='delivery'?'Novo delivery':'Pedido de balcão';
  const standalone=!tableId&&!tabId;

  const add=(product:Product)=>setCart(current=>{const found=current.find(x=>x.productId===product.id);if(found)return current.map(x=>x.productId===product.id?{...x,quantity:x.quantity+1}:x);return[...current,{productId:product.id,name:product.name,unitPrice:Number(product.sale_price),quantity:1,notes:'',imageUrl:product.image_url}]});
  const updateQty=(productId:string,delta:number)=>setCart(current=>current.map(x=>x.productId===productId?{...x,quantity:Math.max(0,x.quantity+delta)}:x).filter(x=>x.quantity>0));
  const updateNotes=(productId:string,notes:string)=>setCart(current=>current.map(x=>x.productId===productId?{...x,notes}:x));
  const remove=(productId:string)=>setCart(current=>current.filter(x=>x.productId!==productId));

  const destination=()=>from==='comandas'?'/comandas':from==='delivery'?'/delivery':from==='retirada'?'/retirada':from==='pedidos'?'/pedidos':'/mesas';
  const send=async()=>{if(!cart.length)return;if(channel==='delivery'&&!address.trim()){setError('Informe o endereço da entrega.');return}setSaving(true);setError('');try{const order=await api.post<{data:{id:string}}>('/api/v1/orders',{channel,tableId:tableId||undefined,tabId:tabId||undefined,items:cart.map(line=>({productId:line.productId,description:line.name,quantity:line.quantity,unitPrice:line.unitPrice,discount:0,notes:line.notes||undefined}))});if(channel==='delivery')await api.post(`/api/v1/orders/${order.data.id}/delivery`,{address:{line1:address.trim()},recipientName:recipientName.trim()||undefined,recipientPhone:recipientPhone.trim()||undefined,deliveryFee:Number(deliveryFee||0)});setCart([]);sessionStorage.removeItem(storageKey);go(destination())}catch(reason){setError(fail(reason,'Não foi possível enviar o pedido.'))}finally{setSaving(false)}};
  const back=()=>go(destination());
  const cash=()=>{const q=new URLSearchParams();if(tabId)q.set('tabId',tabId);if(tableId)q.set('tableId',tableId);go(`/caixa${q.toString()?`?${q}`:''}`)};

  return <>
    <PageHeader title={title} description={standalone?(channel==='delivery'?'Monte o pedido e informe a entrega na mesma tela.':channel==='pickup'?'Monte o pedido de retirada sem abrir mesa ou comanda.':'Monte o pedido de balcão em uma única tela.'):`Atendimento aberto · ${elapsed(check?.opened_at)}. Adicione itens e envie novos pedidos sem perder o histórico da conta.`} action={<div className="row-actions"><Button ghost onClick={back}>Voltar</Button>{!standalone?<Button ghost onClick={()=>void load()}>Atualizar</Button>:null}{!standalone?<Button onClick={cash}>Receber / fechar conta</Button>:null}</div>}/>
    {error?<div className="auth-notice error" role="alert">{error}</div>:null}
    {!standalone?<section className="service-summary"><div><span>Conta</span><strong>{brl(accountTotal)}</strong></div><div><span>Pago</span><strong>{brl(paidTotal)}</strong></div><div><span>Em aberto</span><strong>{brl(Math.max(0,Number(check?.due??accountTotal)))}</strong></div><div><span>Pedidos ativos</span><strong>{openOrders.length}</strong></div></section>:null}
    {channel==='delivery'?<section className="service-delivery-fields"><label><span>Destinatário</span><input value={recipientName} onChange={e=>setRecipientName(e.target.value)} placeholder="Nome do cliente"/></label><label><span>Telefone</span><input value={recipientPhone} onChange={e=>setRecipientPhone(e.target.value)} placeholder="WhatsApp / telefone"/></label><label className="service-address"><span>Endereço *</span><input value={address} onChange={e=>setAddress(e.target.value)} placeholder="Rua, número, bairro, referência"/></label><label><span>Taxa de entrega</span><input type="number" min="0" step="0.01" value={deliveryFee} onChange={e=>setDeliveryFee(e.target.value)}/></label></section>:null}
    <div className="restaurant-service-layout">
      <main className="restaurant-service-menu">
        <div className="service-menu-toolbar"><div><h2>Cardápio</h2><p>Toque no item para adicionar ao pedido atual.</p></div><label className="service-search"><span>Buscar item</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ex.: hambúrguer, refrigerante..." autoFocus/></label></div>
        <div className="service-categories">{categories.map(name=><button type="button" key={name} className={category===name?'active':''} onClick={()=>setCategory(name)}>{name}</button>)}</div>
        {loading?<div className="restaurant-loading">Carregando cardápio…</div>:visibleProducts.length?<div className="service-product-grid">{visibleProducts.map(product=><button type="button" className="service-product-card" key={product.id} onClick={()=>add(product)}>{product.image_url?<img src={product.image_url} alt=""/>:<div className="service-product-placeholder">{product.name.slice(0,2).toUpperCase()}</div>}<div><strong>{product.name}</strong><small>{product.description||'Item do cardápio'}</small><b>{brl(product.sale_price)}</b></div><span aria-hidden>＋</span></button>)}</div>:<EmptyState title="Nenhum item encontrado" description="Tente outra busca ou categoria."/>}
      </main>
      <aside className="service-cart-panel">
        <div className="service-cart-head"><div><span>Pedido atual</span><strong>{cart.reduce((s,x)=>s+x.quantity,0)} item(ns)</strong></div><b>{brl(cartTotal+(channel==='delivery'?Number(deliveryFee||0):0))}</b></div>
        {cart.length?<div className="service-cart-lines">{cart.map(line=><article key={line.productId}><div className="service-cart-line-main"><div><strong>{line.name}</strong><span>{brl(line.unitPrice)} cada</span></div><button type="button" className="service-remove" onClick={()=>remove(line.productId)} aria-label={`Remover ${line.name}`}>×</button></div><div className="service-qty"><button type="button" onClick={()=>updateQty(line.productId,-1)}>−</button><strong>{line.quantity}</strong><button type="button" onClick={()=>updateQty(line.productId,1)}>＋</button><b>{brl(line.unitPrice*line.quantity)}</b></div><input value={line.notes} onChange={e=>updateNotes(line.productId,e.target.value)} placeholder="Observação deste item"/></article>)}</div>:<div className="service-cart-empty"><strong>Nenhum item selecionado</strong><span>Use o cardápio ao lado para montar o pedido.</span></div>}
        <div className="service-cart-footer"><div><span>Total do pedido</span><strong>{brl(cartTotal+(channel==='delivery'?Number(deliveryFee||0):0))}</strong></div><Button disabled={!cart.length||saving} onClick={()=>void send()}>{saving?'Enviando…':channel==='delivery'?'Confirmar delivery':channel==='pickup'?'Confirmar retirada':'Enviar pedido'}</Button><small>O carrinho fica salvo nesta sessão até você confirmar. Depois você volta para a visão operacional de origem.</small></div>
      </aside>
    </div>
    {!standalone?<section className="service-history"><div className="service-history-head"><div><h2>Consumo da conta</h2><p>Todos os pedidos enviados durante este atendimento.</p></div><strong>{brl(accountTotal)}</strong></div>{accountOrders.length?<div className="service-order-list">{accountOrders.map(order=><article key={order.id}><div className="service-order-title"><div><strong>Pedido #{String(order.id).slice(-4).toUpperCase()}</strong><span>{elapsed(order.created_at)} · {order.fulfillment_status||order.status}</span></div><b>{brl(order.total)}</b></div><div className="service-order-items">{(order.items??[]).map(item=><span key={item.id}>{Number(item.quantity)}× {item.description}{item.notes?` · ${item.notes}`:''}</span>)}</div></article>)}</div>:<div className="service-history-empty">Ainda não há pedidos enviados nesta conta.</div>}</section>:null}
  </>;
}
