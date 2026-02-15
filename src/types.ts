export interface Env {
  AVAILABILITY: DurableObjectNamespace;
  NOTIFY_WEBHOOK_URL?: string;
  // Email configuration (Resend)
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  // Feature flags (disabled by default - set to "true" to enable)
  EMAIL_INVITE_ENABLED?: string;
  EMAIL_CONFIRM_ENABLED?: string;
}

export type AllowedWindow = {
  startTime: string;
  endTime: string;
};

export type RequestData = {
  id: string;
  adminToken: string;
  hostName: string;
  guestName: string;
  guestEmail: string;
  hostTimezone: string;
  allowedDateStart: string;
  allowedDateEnd: string;
  allowedTimeWindows: AllowedWindow[];
  createdAt: string;
  type?: "individual" | "group";
  eventTitle?: string;
  slotDurationMinutes?: number;
  bufferMinutes?: number;
};

export type SubmissionData = {
  availability: { startUtc: string; endUtc: string }[];
  guestTimezone: string;
  submittedAt: string;
  updatedAt?: string;
};

export type ConfirmedSlot = {
  startUtc: string;
  endUtc: string;
  title: string;
  description: string;
  location: string;
  confirmedAt: string;
};

export type GroupBooking = {
  slotStartUtc: string;
  slotEndUtc: string;
  guestName: string;
  guestEmail: string;
  guestTimezone: string;
  bookedAt: string;
};

export type GroupBookingsData = {
  bookings: GroupBooking[];
};

export type GeneratedSlot = {
  startUtc: string;
  endUtc: string;
};
