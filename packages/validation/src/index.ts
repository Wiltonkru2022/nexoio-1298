import { z } from 'zod';

const emptyToUndefined = (value: unknown) => value === '' ? undefined : value;
export const email = z.preprocess(emptyToUndefined, z.email().max(254).optional());
export const optionalText = (max: number) => z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());
export const uuid = z.uuid();
export const money = z.coerce.number().finite().min(0).max(999_999_999_999.99);

export const createCustomerSchema = z.object({
  name: z.string().trim().min(2).max(150), phone: optionalText(30), whatsapp: optionalText(30),
  email, cpf: optionalText(14), birthDate: z.iso.date().optional(), notes: optionalText(5000), unitId: uuid.optional()
}).strict();

export const updateCustomerSchema = createCustomerSchema.partial().refine((v) => Object.keys(v).length > 0);
export const createProductSchema = z.object({
  name: z.string().trim().min(2).max(200), sku: optionalText(80), barcode: optionalText(80), description: optionalText(5000),
  salePrice: money, costPrice: money.optional(), stockControlEnabled: z.boolean().default(false), minimumStock: z.coerce.number().min(0).optional()
}).strict();
export const createServiceSchema = z.object({
  name: z.string().trim().min(2).max(200), description: optionalText(5000), price: money,
  durationMinutes: z.coerce.number().int().positive().max(1440).optional()
}).strict();
export const createAppointmentSchema = z.object({
  customerId: uuid.optional(), professionalId: uuid, serviceId: uuid, unitId: uuid.optional(),
  startsAt: z.iso.datetime({ offset: true }), endsAt: z.iso.datetime({ offset: true }), notes: optionalText(5000)
}).strict().refine((v) => new Date(v.endsAt) > new Date(v.startsAt), { message: 'endsAt must be after startsAt', path: ['endsAt'] });
export const saleItemSchema = z.object({ itemType: z.enum(['product','service','other']), productId: uuid.optional(), serviceId: uuid.optional(), description: z.string().min(1).max(300), quantity: z.number().positive(), unitPrice: money, discount: money.default(0) });
export const createSaleSchema = z.object({ customerId: uuid.optional(), unitId: uuid.optional(), notes: optionalText(5000), items: z.array(saleItemSchema).min(1).max(200) }).strict();
