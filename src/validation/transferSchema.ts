import { z } from 'zod';

const eventSchema = z.object({
  event_id: z
    .string({ required_error: 'event_id is required', invalid_type_error: 'event_id must be a string' })
    .min(1, 'event_id is required'),
  station_id: z
    .string({ required_error: 'station_id is required', invalid_type_error: 'station_id must be a string' })
    .min(1, 'station_id is required'),
  amount: z
    .number({ required_error: 'amount is required', invalid_type_error: 'amount must be a number' })
    .nonnegative('amount must be non-negative'),
  status: z
    .string({ required_error: 'status is required', invalid_type_error: 'status must be a string' })
    .min(1, 'status is required'),
  created_at: z
    .string({ required_error: 'created_at is required', invalid_type_error: 'created_at must be a string' })
    .min(1, 'created_at is required')
    .refine((v) => !isNaN(Date.parse(v)), { message: 'created_at must be a valid ISO 8601 date-time' }),
});

export const insertRequestSchema = z.object({
  events: z
    .array(eventSchema, { required_error: '"events" field is required' })
    .min(1, 'events must not be empty')
    .max(1000, 'events must not exceed 1000 items per request'),
});

export type InsertRequestInput = z.infer<typeof insertRequestSchema>;
