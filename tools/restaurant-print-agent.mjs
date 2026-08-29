/* global process, console, setTimeout, clearTimeout, fetch, Buffer */
import net from 'node:net';

const apiUrl=(process.env.NEXOIO_API_URL||'http://localhost:8787').replace(/\/$/,'');
const token=process.env.NEXOIO_PRINT_AGENT_TOKEN||'';
const pollMs=Math.max(1000,Number(process.env.NEXOIO_PRINT_POLL_MS||2000));
let printerMap={};
try{printerMap=JSON.parse(process.env.NEXOIO_PRINTER_MAP||'{}')}catch{console.error('NEXOIO_PRINTER_MAP precisa ser JSON válido.');process.exit(1)}
if(!token){console.error('Defina NEXOIO_PRINT_AGENT_TOKEN.');process.exit(1)}

const headers={authorization:`Bearer ${token}`,'content-type':'application/json',accept:'application/json'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const request=async(path,body)=>{const response=await fetch(`${apiUrl}${path}`,{method:'POST',headers,body:JSON.stringify(body??{})});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload?.error?.message||payload?.message||`HTTP ${response.status}`);return payload;};
const resolveTarget=key=>{if(!key)return null;const mapped=printerMap[key]||key;const raw=String(mapped).replace(/^tcp:\/\//i,'');const [host,portRaw]=raw.split(':');const port=Number(portRaw||9100);return host&&Number.isFinite(port)?{host,port}:null;};
const line=(text='',width=42)=>String(text).replace(/[\r\n]+/g,' ').slice(0,width);
const formatJob=job=>{
  const p=job.payload||{};const station=p.station?.name||'PRODUÇÃO';const items=Array.isArray(p.items)?p.items:[];const parts=['\x1b@','\x1ba\x01',`${station.toUpperCase()}\n`,'\x1ba\x00',`PEDIDO ${String(p.orderId||job.order_id||'').slice(-6).toUpperCase()}\n`];
  if(p.tableId)parts.push(`MESA: ${String(p.tableId).slice(-4).toUpperCase()}\n`);if(p.channel)parts.push(`CANAL: ${String(p.channel).toUpperCase()}\n`);parts.push('------------------------------------------\n');
  for(const item of items){parts.push(`${Number(item.quantity||0)}x ${line(item.description)}\n`);if(item.notes)parts.push(`  OBS: ${line(item.notes,36)}\n`);}if(p.notes)parts.push(`OBS PEDIDO: ${line(p.notes,34)}\n`);parts.push('------------------------------------------\n\n\n','\x1dV\x00');return Buffer.from(parts.join(''),'latin1');
};
const printTcp=(target,buffer)=>new Promise((resolve,reject)=>{const socket=net.createConnection({host:target.host,port:target.port});const timer=setTimeout(()=>socket.destroy(new Error('Timeout de impressão')),8000);socket.once('connect',()=>socket.end(buffer));socket.once('error',err=>{clearTimeout(timer);reject(err)});socket.once('close',hadError=>{clearTimeout(timer);if(!hadError)resolve()});});

async function run(){
  console.log(`Nexoio Print Agent conectado em ${apiUrl}`);
  while(true){
    try{
      const claimed=await request('/api/print-agent/jobs/claim',{limit:10});const jobs=claimed?.data||[];
      for(const job of jobs){
        try{const target=resolveTarget(job.printer_key);if(!target)throw new Error(`Impressora não mapeada: ${job.printer_key||'(vazia)'}`);await printTcp(target,formatJob(job));await request(`/api/print-agent/jobs/${job.id}/complete`,{status:'printed'});console.log(`Impresso ${job.id} -> ${job.printer_key}`);}catch(err){const message=err instanceof Error?err.message:String(err);console.error(`Falha ${job.id}: ${message}`);try{await request(`/api/print-agent/jobs/${job.id}/complete`,{status:'failed',error:message})}catch(ackErr){console.error('Falha ao registrar erro:',ackErr)}}
      }
    }catch(err){console.error('Falha ao consultar fila:',err instanceof Error?err.message:err)}
    await sleep(pollMs);
  }
}
run().catch(err=>{console.error(err);process.exit(1)});
