import { index, integer, jsonb, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { businesses, customers, products, sales, users } from './schema';

const money=(name:string)=>numeric(name,{precision:14,scale:2});
const qty=(name:string)=>numeric(name,{precision:14,scale:3});
const createdAt=()=>timestamp('created_at',{withTimezone:true}).notNull().defaultNow();
const updatedAt=()=>timestamp('updated_at',{withTimezone:true}).notNull().defaultNow();

export const restaurantTables=pgTable('restaurant_tables',{
 id:uuid().primaryKey(), businessId:uuid('business_id').notNull().references(()=>businesses.id,{onDelete:'cascade'}), code:text().notNull(), capacity:integer().notNull().default(4), area:text(), status:text().notNull().default('free'), currentTabId:uuid('current_tab_id'), occupiedAt:timestamp('occupied_at',{withTimezone:true}), createdAt:createdAt(), updatedAt:updatedAt()
},t=>[index('restaurant_tables_business_idx').on(t.businessId,t.code)]);

export const restaurantTabs=pgTable('restaurant_tabs',{
 id:uuid().primaryKey(), businessId:uuid('business_id').notNull().references(()=>businesses.id,{onDelete:'cascade'}), code:text().notNull(), tableId:uuid('table_id').references(()=>restaurantTables.id), customerId:uuid('customer_id').references(()=>customers.id), channel:text().notNull().default('table'), fulfillmentJson:jsonb('fulfillment_json').notNull().default({}), status:text().notNull().default('active'), subtotal:money('subtotal').notNull().default('0'), discount:money('discount').notNull().default('0'), total:money('total').notNull().default('0'), saleId:uuid('sale_id').references(()=>sales.id), openedAt:timestamp('opened_at',{withTimezone:true}).notNull().defaultNow(), requestedClosureAt:timestamp('requested_closure_at',{withTimezone:true}), closedAt:timestamp('closed_at',{withTimezone:true}), createdBy:uuid('created_by').notNull().references(()=>users.id), createdAt:createdAt(), updatedAt:updatedAt()
},t=>[index('restaurant_tabs_business_status_idx').on(t.businessId,t.status),index('restaurant_tabs_table_idx').on(t.businessId,t.tableId)]);

export const restaurantOrders=pgTable('restaurant_orders',{
 id:uuid().primaryKey(),businessId:uuid('business_id').notNull().references(()=>businesses.id,{onDelete:'cascade'}),tabId:uuid('tab_id').notNull().references(()=>restaurantTabs.id,{onDelete:'cascade'}),status:text().notNull().default('open'),notes:text(),createdBy:uuid('created_by').notNull().references(()=>users.id),createdAt:createdAt(),updatedAt:updatedAt()
},t=>[index('restaurant_orders_tab_idx').on(t.businessId,t.tabId,t.createdAt)]);

export const restaurantOrderItems=pgTable('restaurant_order_items',{
 id:uuid().primaryKey(),businessId:uuid('business_id').notNull().references(()=>businesses.id,{onDelete:'cascade'}),orderId:uuid('order_id').notNull().references(()=>restaurantOrders.id,{onDelete:'cascade'}),productId:uuid('product_id').references(()=>products.id),description:text().notNull(),quantity:qty('quantity').notNull(),unitPrice:money('unit_price').notNull(),total:money('total').notNull(),status:text().notNull().default('new'),createdAt:createdAt()
},t=>[index('restaurant_order_items_order_idx').on(t.businessId,t.orderId)]);

export const kitchenTickets=pgTable('kitchen_tickets',{
 id:uuid().primaryKey(),businessId:uuid('business_id').notNull().references(()=>businesses.id,{onDelete:'cascade'}),orderId:uuid('order_id').notNull().references(()=>restaurantOrders.id,{onDelete:'cascade'}),status:text().notNull().default('queued'),createdAt:createdAt(),startedAt:timestamp('started_at',{withTimezone:true}),readyAt:timestamp('ready_at',{withTimezone:true})
},t=>[index('kitchen_tickets_business_status_idx').on(t.businessId,t.status)]);

export const restaurantPayments=pgTable('restaurant_payments',{
 id:uuid().primaryKey(),businessId:uuid('business_id').notNull().references(()=>businesses.id,{onDelete:'cascade'}),tabId:uuid('tab_id').notNull().references(()=>restaurantTabs.id,{onDelete:'cascade'}),method:text().notNull(),amount:money('amount').notNull(),status:text().notNull().default('confirmed'),externalReference:text('external_reference'),paidAt:timestamp('paid_at',{withTimezone:true}).notNull().defaultNow(),createdAt:createdAt()
},t=>[index('restaurant_payments_tab_idx').on(t.businessId,t.tabId)]);
