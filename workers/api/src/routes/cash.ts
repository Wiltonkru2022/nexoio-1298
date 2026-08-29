import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { cashMovements, cashSessions } from '@nexoio/db';
import { uuidv7 } from '@nexoio/core';
import { error } from '../middleware';
import type { ApiEnv } from '../types';

export const cashRoutes = new Hono<ApiEnv>();
const num=(v:unknown)=>Number(v??0);

cashRoutes.get('/', async c=>{
  const b=c.get('auth').businessId, db=c.get('db');
  const sessions=await db.select().from(cashSessions).where(eq(cashSessions.businessId,b)).orderBy(desc(cashSessions.openedAt)).limit(1);
  const session=sessions[0]??null;
  if(!session) return c.json({data:{session:null,movements:[],summary:{opening:0,entries:0,exits:0,balance:0}}});
  const movements=await db.select().from(cashMovements).where(and(eq(cashMovements.businessId,b),eq(cashMovements.cashSessionId,session.id))).orderBy(desc(cashMovements.createdAt));
  const entries=movements.filter(m=>!['withdrawal','expense','refund','out'].includes(m.movementType)).reduce((s,m)=>s+Math.abs(num(m.amount)),0);
  const exits=movements.filter(m=>['withdrawal','expense','refund','out'].includes(m.movementType)).reduce((s,m)=>s+Math.abs(num(m.amount)),0);
  const opening=num(session.openingAmount);
  return c.json({data:{session,movements,summary:{opening,entries,exits,balance:opening+entries-exits}}});
});

cashRoutes.post('/open',async c=>{
  const b=c.get('auth').businessId,db=c.get('db'),body=await c.req.json().catch(()=>({}));
  const current=await db.select().from(cashSessions).where(and(eq(cashSessions.businessId,b),eq(cashSessions.status,'open'))).limit(1);
  if(current[0]) return error(c,409,'CASH_ALREADY_OPEN','Já existe um caixa aberto');
  const opening=Math.max(0,num(body.openingAmount));
  const row={id:uuidv7(),businessId:b,unitId:body.unitId?String(body.unitId):null,openedBy:c.get('auth').userId,openingAmount:opening.toFixed(2),status:'open'};
  await db.insert(cashSessions).values(row);
  return c.json({data:row},201);
});

cashRoutes.post('/movement',async c=>{
  const b=c.get('auth').businessId,db=c.get('db'),body=await c.req.json().catch(()=>({}));
  const session=await db.select().from(cashSessions).where(and(eq(cashSessions.businessId,b),eq(cashSessions.status,'open'))).limit(1);
  if(!session[0]) return error(c,409,'CASH_CLOSED','Abra o caixa antes de movimentar');
  const amount=Math.abs(num(body.amount)); if(amount<=0)return error(c,400,'VALIDATION_ERROR','Valor inválido');
  const type=String(body.movementType||'supply');
  const row={id:uuidv7(),businessId:b,cashSessionId:session[0].id,movementType:type,amount:amount.toFixed(2),referenceType:body.referenceType?String(body.referenceType):null,referenceId:body.referenceId?String(body.referenceId):null,description:String(body.description||'Movimentação manual'),createdBy:c.get('auth').userId};
  await db.insert(cashMovements).values(row);
  return c.json({data:row},201);
});

cashRoutes.post('/close',async c=>{
  const b=c.get('auth').businessId,db=c.get('db'),body=await c.req.json().catch(()=>({}));
  const session=await db.select().from(cashSessions).where(and(eq(cashSessions.businessId,b),eq(cashSessions.status,'open'))).limit(1);
  if(!session[0]) return error(c,409,'CASH_CLOSED','Não existe caixa aberto');
  const movements=await db.select().from(cashMovements).where(and(eq(cashMovements.businessId,b),eq(cashMovements.cashSessionId,session[0].id)));
  const entries=movements.filter(m=>!['withdrawal','expense','refund','out'].includes(m.movementType)).reduce((s,m)=>s+Math.abs(num(m.amount)),0);
  const exits=movements.filter(m=>['withdrawal','expense','refund','out'].includes(m.movementType)).reduce((s,m)=>s+Math.abs(num(m.amount)),0);
  const expected=num(session[0].openingAmount)+entries-exits;
  const closing=body.closingAmount===undefined?expected:num(body.closingAmount);
  await db.update(cashSessions).set({status:'closed',closedBy:c.get('auth').userId,closingAmount:closing.toFixed(2),closedAt:new Date()}).where(and(eq(cashSessions.id,session[0].id),eq(cashSessions.businessId,b)));
  return c.json({data:{id:session[0].id,expected,closing,difference:closing-expected}});
});
