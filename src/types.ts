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

export type GuestInfo = {
  token: string;
  name: string;
  email: string;
  invitedAt: string;
};

export type GuestSubmission = {
  guestToken: string;
  availability: { startUtc: string; endUtc: string }[];
  guestTimezone: string;
  submittedAt: string;
  updatedAt?: string;
};

export type GroupSubmissionsData = {
  submissions: GuestSubmission[];
};

export type TimeSlot = {
  startUtc: string;
  endUtc: string;
  participantCount: number;
  participantTokens: string[];
};

export type AggregatedAvailability = {
  slots: TimeSlot[];
  totalGuests: number;
  submittedCount: number;
  maxParticipation: number;
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

/** Shared email validation regex */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Discriminated union for RequestData ──

type BaseRequestData = {
  id: string;
  adminToken: string;
  hostName: string;
  hostTimezone: string;
  allowedDateStart: string;
  allowedDateEnd: string;
  allowedTimeWindows: AllowedWindow[];
  createdAt: string;
};

export type IndividualRequestData = BaseRequestData & {
  type?: "individual";
  guestName: string;
  guestEmail: string;
};

export type GroupEventRequestData = BaseRequestData & {
  type: "group";
  eventTitle: string;
  slotDurationMinutes: number;
  bufferMinutes: number;
  guestName?: string;
  guestEmail?: string;
};

export type GroupAvailabilityRequestData = BaseRequestData & {
  type: "group-availability";
  guests: GuestInfo[];
  participationThreshold: number;
  confirmed?: boolean;
  hostEmail?: string;
};

export type RequestData =
  | IndividualRequestData
  | GroupEventRequestData
  | GroupAvailabilityRequestData;

// Type guards with proper narrowing predicates
export function isGroupAvailabilityRequest(
  request: RequestData
): request is GroupAvailabilityRequestData {
  return request.type === "group-availability";
}

export function isIndividualRequest(
  request: RequestData
): request is IndividualRequestData {
  return request.type === "individual" || !request.type;
}

export function isGroupEventRequest(
  request: RequestData
): request is GroupEventRequestData {
  return request.type === "group";
}
