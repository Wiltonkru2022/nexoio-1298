import postgres from 'postgres';

function required(name:string){const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;}
function assert(condition:unknown,message:string):asserts condition{if(!condition)throw new Error(message)}
function normalizedOrigin(value:string){const url=new URL(value);assert(url.protocol==='https:',`${url.href} must use HTTPS`);assert(!url.pathname||url.pathname==='/',`${url.href} must not include a path`);return url.origin;}

const env=required('TARGET_ENV');
assert(env==='staging'||env==='production','TARGET_ENV must be staging or production');
const expected=env==='staging'?{
  deployGuard:'NEXOIO_STAGING',api:'https://api-staging.nexoio.com.br',merchant:'https://app-staging.nexoio.com.br',admin:'https://admin-staging.nexoio.com.br',bucket:'nexoio-staging',
}:{
  deployGuard:'NEXOIO_PRODUCTION',api:'https://api.nexoio.com.br',merchant:'https://app.nexoio.com.br',admin:'https://admin.nexoio.com.br',bucket:'nexoio-prod',
};

assert(required('DEPLOY_GUARD')===expected.deployGuard,`DEPLOY_GUARD does not match ${env}`);
assert(normalizedOrigin(required('API_PUBLIC_URL'))===expected.api,`API_PUBLIC_URL must be ${expected.api}`);
assert(normalizedOrigin(required('MERCHANT_SMOKE_URL'))===expected.merchant,`MERCHANT_SMOKE_URL must be ${expected.merchant}`);
assert(normalizedOrigin(required('ADMIN_SMOKE_URL'))===expected.admin,`ADMIN_SMOKE_URL must be ${expected.admin}`);

const publicSmoke=new URL(required('PUBLIC_SITE_SMOKE_URL'));
assert(publicSmoke.protocol==='https:','PUBLIC_SITE_SMOKE_URL must use HTTPS');
const reserved=new Set(['api.nexoio.com.br','app.nexoio.com.br','admin.nexoio.com.br','api-staging.nexoio.com.br','app-staging.nexoio.com.br','admin-staging.nexoio.com.br']);
assert(!reserved.has(publicSmoke.hostname),'PUBLIC_SITE_SMOKE_URL must point to a tenant/public-site hostname');
if(env==='staging')assert(publicSmoke.hostname.endsWith('-staging.nexoio.com.br'),'Staging public-site smoke hostname must end with -staging.nexoio.com.br');
else assert(publicSmoke.hostname.endsWith('.nexoio.com.br'),'Production public-site smoke hostname must be under nexoio.com.br');

const databaseUrl=new URL(required('DATABASE_URL'));
assert(['postgres:','postgresql:'].includes(databaseUrl.protocol),'DATABASE_URL must be PostgreSQL');
assert(databaseUrl.hostname.endsWith('.neon.tech'),'DATABASE_URL must point to Neon');
assert(databaseUrl.hostname===required('DATABASE_HOST_GUARD'),'DATABASE_URL host does not match DATABASE_HOST_GUARD');
const expectedDatabase=required('DATABASE_NAME_GUARD');
const databaseName=decodeURIComponent(databaseUrl.pathname.replace(/^\//,''));
assert(databaseName===expectedDatabase,'DATABASE_URL database does not match DATABASE_NAME_GUARD');

const cloudflareAccount=required('CLOUDFLARE_ACCOUNT_ID');
const cloudflareToken=required('CLOUDFLARE_API_TOKEN');
const saasToken=required('SAAS_CLOUDFLARE_API_TOKEN');
const zoneId=required('CLOUDFLARE_ZONE_ID');
required('SAAS_CNAME_TARGET');

async function cf(path:string,token:string){
  const response=await fetch(`https://api.cloudflare.com/client/v4${path}`,{headers:{authorization:`Bearer ${token}`,accept:'application/json'}});
  const body:any=await response.json().catch(()=>({}));
  assert(response.ok&&body?.success!==false,`Cloudflare preflight failed for ${path}`);
  return body;
}

async function main(){
  const sql=postgres(process.env.DATABASE_URL!,{max:1,connect_timeout:10,idle_timeout:2});
  try{
    const [identity]=await sql<{database:string}[]>`select current_database() as database`;
    assert(identity?.database===expectedDatabase,'Connected database identity differs from DATABASE_NAME_GUARD');
  } finally { await sql.end({timeout:2}); }

  const zone=await cf(`/zones/${zoneId}`,saasToken);
  assert(zone?.result?.name==='nexoio.com.br','CLOUDFLARE_ZONE_ID is not the nexoio.com.br zone');
  if(zone?.result?.account?.id)assert(zone.result.account.id===cloudflareAccount,'Cloudflare zone belongs to a different account');

  const buckets=await cf(`/accounts/${cloudflareAccount}/r2/buckets`,cloudflareToken);
  const bucketNames=(buckets?.result?.buckets??buckets?.result??[]).map((item:any)=>item?.name).filter(Boolean);
  assert(bucketNames.includes(expected.bucket),`R2 bucket ${expected.bucket} was not found`);

  const provider=(process.env.BILLING_PROVIDER??'').trim().toLowerCase();
  if(provider==='asaas'){
    const base=required('BILLING_API_URL').replace(/\/$/,'');
    const key=required('BILLING_API_KEY');
    required('BILLING_WEBHOOK_SECRET');
    if(env==='staging')assert(base.toLowerCase().includes('sandbox'),'Staging Asaas URL must be sandbox');
    else assert(!base.toLowerCase().includes('sandbox'),'Production Asaas URL must not be sandbox');
    const response=await fetch(`${base}/myAccount`,{headers:{accept:'application/json',access_token:key,'user-agent':'Nexoio/1.0'}});
    assert(response.ok,`Asaas authentication preflight failed (${response.status})`);
  }

  console.log(`Release preflight OK: ${env}; DB=${expectedDatabase}; R2=${expected.bucket}; zone=nexoio.com.br`);
}

main().catch(error=>{console.error(`Release preflight failed: ${error instanceof Error?error.message:String(error)}`);process.exit(1)});
