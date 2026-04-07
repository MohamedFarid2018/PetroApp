export interface TransferEvent {
  event_id: string;
  station_id: string;
  amount: number;
  status: string;
  created_at: Date;
}

export interface StationSummary {
  station_id: string;
  total_approved_amount: number;
  events_count: number;
}

export interface InsertResult {
  inserted: number;
  duplicates: number;
}
