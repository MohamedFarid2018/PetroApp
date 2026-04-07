import { z } from 'zod';

const eventSchema = z.object({
  event_id: z.string().min(1, 'event_id is required'),
  station_id: z.string().min(1, 'station_id is required'),
  amount: z.number({ required_error: 'amount is required' }).nonnegative('amount must be non-negative'),
  status: z.string().min(1, 'status is required'),
  created_at: z
    .string()
    .min(1, 'created_at is required')
    .refine((v) => !isNaN(Date.parse(v)), { message: 'created_at must be a valid ISO 8601 date-time' }),
});

export const insertRequestSchema = z.object({
  events: z.array(eventSchema, { required_error: '"events" field is required' }),
});

export type InsertRequestInput = z.infer<typeof insertRequestSchema>;
