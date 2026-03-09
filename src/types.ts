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

export type RequestData = {
  id: string;
  adminToken: string;
  hostName: string;
  hostTimezone: string;
  allowedDateStart: string;
  allowedDateEnd: string;
  allowedTimeWindows: AllowedWindow[];
  createdAt: string;
  type?: "individual" | "group" | "group-availability";
  
  // Legacy fields for individual and group types
  guestName?: string;
  guestEmail?: string;
  eventTitle?: string;
  slotDurationMinutes?: number;
  bufferMinutes?: number;
  
  // Group availability specific fields
  guests?: GuestInfo[];
  participationThreshold?: number;
  confirmed?: boolean;
  hostEmail?: string;
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

// Type guards for distinguishing request types
export function isGroupAvailabilityRequest(request: RequestData): boolean {
  return request.type === "group-availability" && Array.isArray(request.guests);
}

export function isIndividualRequest(request: RequestData): boolean {
  return (request.type === "individual" || !request.type) && 
         typeof request.guestName === "string" && 
         typeof request.guestEmail === "string";
}

export function isGroupEventRequest(request: RequestData): boolean {
  return request.type === "group" && 
         typeof request.eventTitle === "string" &&
         typeof request.slotDurationMinutes === "number";
}
