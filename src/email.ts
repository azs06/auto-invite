import type { Env, ConfirmedSlot } from "./types";

type EmailAttachment = {
  filename: string;
  content: string; // base64 encoded
  contentType?: string;
};

export async function sendEmail(env: Env, params: {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return false;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      attachments: params.attachments?.map(a => ({
        filename: a.filename,
        content: a.content,
        content_type: a.contentType,
      })),
    }),
  });
  return response.ok;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatDateRange(start: string, end: string, timezone: string): string {
  const formatDate = (iso: string) => {
    const date = new Date(iso + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  };
  return `${formatDate(start)} - ${formatDate(end)} (${timezone})`;
}

export function renderInviteEmail(params: {
  hostName: string;
  guestName: string;
  dateRange: string;
  guestUrl: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0d1117; color: #c9d1d9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0d1117; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #161b22; border-radius: 12px; border: 1px solid #30363d;">
          <tr>
            <td style="padding: 32px;">
              <p style="color: #d4a855; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px 0;">Auto Invite</p>
              <h1 style="margin: 0 0 24px 0; color: #c9d1d9; font-size: 22px; font-weight: 600;">You're invited to share your availability</h1>

              <p style="color: #8b949e; line-height: 1.6; margin: 0 0 20px 0;">
                <strong style="color: #c9d1d9;">${escapeHtml(params.hostName)}</strong> would like to schedule a meeting with you.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0d1117; border-radius: 8px; margin: 0 0 24px 0;">
                <tr>
                  <td style="padding: 16px;">
                    <p style="margin: 0 0 4px 0; font-size: 12px; color: #8b949e; text-transform: uppercase;">Date Range</p>
                    <p style="margin: 0; color: #c9d1d9;">${escapeHtml(params.dateRange)}</p>
                  </td>
                </tr>
              </table>

              <a href="${escapeHtml(params.guestUrl)}" style="display: block; background-color: #d4a855; color: #0d1117; text-decoration: none; padding: 14px 24px; border-radius: 8px; font-weight: 600; text-align: center;">
                Select Your Available Times
              </a>

              <p style="color: #6e7681; font-size: 13px; line-height: 1.5; margin: 24px 0 0 0;">
                Click the button above to open the scheduling page. Your timezone will be detected automatically.
              </p>
            </td>
          </tr>
        </table>
        <p style="color: #6e7681; font-size: 12px; margin-top: 16px;">Sent via Auto Invite</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderConfirmationEmail(params: {
  guestName: string;
  hostName: string;
  title: string;
  startTime: string;
  endTime: string;
  location?: string;
  description?: string;
}): string {
  const locationHtml = params.location
    ? `<tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid #30363d;">
          <p style="margin: 0 0 4px 0; font-size: 12px; color: #8b949e; text-transform: uppercase;">Location</p>
          <p style="margin: 0; color: #c9d1d9;">${escapeHtml(params.location)}</p>
        </td>
      </tr>`
    : '';

  const descriptionHtml = params.description
    ? `<tr>
        <td style="padding: 12px 16px;">
          <p style="margin: 0 0 4px 0; font-size: 12px; color: #8b949e; text-transform: uppercase;">Description</p>
          <p style="margin: 0; color: #c9d1d9; white-space: pre-wrap;">${escapeHtml(params.description)}</p>
        </td>
      </tr>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0d1117; color: #c9d1d9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0d1117; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #161b22; border-radius: 12px; border: 1px solid #30363d;">
          <tr>
            <td style="padding: 32px;">
              <p style="color: #d4a855; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px 0;">Auto Invite</p>
              <h1 style="margin: 0 0 24px 0; color: #c9d1d9; font-size: 22px; font-weight: 600;">Your meeting is confirmed!</h1>

              <p style="color: #8b949e; line-height: 1.6; margin: 0 0 20px 0;">
                <strong style="color: #c9d1d9;">${escapeHtml(params.hostName)}</strong> has confirmed your meeting time.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0d1117; border-radius: 8px; margin: 0 0 24px 0; border: 1px solid #30363d;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #30363d;">
                    <p style="margin: 0 0 4px 0; font-size: 12px; color: #8b949e; text-transform: uppercase;">Event</p>
                    <p style="margin: 0; color: #c9d1d9; font-weight: 600;">${escapeHtml(params.title)}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #30363d;">
                    <p style="margin: 0 0 4px 0; font-size: 12px; color: #8b949e; text-transform: uppercase;">When</p>
                    <p style="margin: 0; color: #c9d1d9;">${escapeHtml(params.startTime)}</p>
                    <p style="margin: 4px 0 0 0; color: #8b949e; font-size: 13px;">to ${escapeHtml(params.endTime)}</p>
                  </td>
                </tr>
                ${locationHtml}
                ${descriptionHtml}
              </table>

              <p style="color: #8b949e; font-size: 14px; line-height: 1.5; margin: 0 0 8px 0;">
                A calendar invite (.ics) is attached to this email. Open it to add the event to your calendar.
              </p>
            </td>
          </tr>
        </table>
        <p style="color: #6e7681; font-size: 12px; margin-top: 16px;">Sent via Auto Invite</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function generateConfirmationICS(params: {
  requestId: string;
  title: string;
  description: string;
  location: string;
  startUtc: string;
  endUtc: string;
  hostName: string;
  guestName: string;
  guestEmail: string;
}): string {
  const formatICSDate = (isoString: string) => {
    return isoString.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  };

  const escapeICS = (text: string) => {
    return text.replace(/[\\;,\n]/g, (match) => {
      if (match === "\n") return "\\n";
      return "\\" + match;
    });
  };

  const uid = `${params.requestId}-confirmed@auto-invite`;
  const dtstamp = formatICSDate(new Date().toISOString());
  const dtstart = formatICSDate(params.startUtc);
  const dtend = formatICSDate(params.endUtc);
  const summary = escapeICS(params.title);
  const description = escapeICS(
    params.description ||
    `Meeting confirmed via Auto Invite.\\nHost: ${params.hostName}\\nGuest: ${params.guestName}`
  );

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Auto Invite//Meeting Confirmation//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
  ];

  if (params.location) {
    lines.push(`LOCATION:${escapeICS(params.location)}`);
  }

  lines.push(
    `ORGANIZER;CN=${escapeICS(params.hostName)}:mailto:noreply@auto-invite.app`,
    `ATTENDEE;CN=${escapeICS(params.guestName)};RSVP=TRUE:mailto:${params.guestEmail}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR"
  );

  return lines.join("\r\n");
}

export function formatTimeForEmail(utcIso: string, timezone: string): string {
  const date = new Date(utcIso);
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
    timeZoneName: 'short',
  });
}

export async function sendInviteEmail(env: Env, params: {
  hostName: string;
  guestName: string;
  guestEmail: string;
  dateStart: string;
  dateEnd: string;
  hostTimezone: string;
  guestUrl: string;
}): Promise<boolean> {
  const dateRange = formatDateRange(params.dateStart, params.dateEnd, params.hostTimezone);
  const html = renderInviteEmail({
    hostName: params.hostName,
    guestName: params.guestName,
    dateRange,
    guestUrl: params.guestUrl,
  });

  return sendEmail(env, {
    to: params.guestEmail,
    subject: `${params.hostName} invited you to share your availability`,
    html,
  });
}

export async function sendConfirmationEmail(env: Env, params: {
  requestId: string;
  guestName: string;
  guestEmail: string;
  hostName: string;
  guestTimezone: string;
  confirmed: ConfirmedSlot;
}): Promise<boolean> {
  const startTime = formatTimeForEmail(params.confirmed.startUtc, params.guestTimezone);
  const endTime = formatTimeForEmail(params.confirmed.endUtc, params.guestTimezone);

  const html = renderConfirmationEmail({
    guestName: params.guestName,
    hostName: params.hostName,
    title: params.confirmed.title,
    startTime,
    endTime,
    location: params.confirmed.location || undefined,
    description: params.confirmed.description || undefined,
  });

  const ics = generateConfirmationICS({
    requestId: params.requestId,
    title: params.confirmed.title,
    description: params.confirmed.description,
    location: params.confirmed.location,
    startUtc: params.confirmed.startUtc,
    endUtc: params.confirmed.endUtc,
    hostName: params.hostName,
    guestName: params.guestName,
    guestEmail: params.guestEmail,
  });

  const icsBase64 = btoa(ics);

  return sendEmail(env, {
    to: params.guestEmail,
    subject: `Confirmed: ${params.confirmed.title}`,
    html,
    attachments: [{
      filename: 'meeting.ics',
      content: icsBase64,
      contentType: 'text/calendar',
    }],
  });
}

export function renderGroupGuestSubmissionEmail(params: {
  hostName: string;
  guestName: string;
  requestId: string;
  adminUrl: string;
  submittedAt: string;
  isUpdate: boolean;
}): string {
  const action = params.isUpdate ? 'updated their availability' : 'submitted their availability';
  const formattedTime = new Date(params.submittedAt).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone: 'UTC',
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0d1117; color: #c9d1d9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0d1117; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #161b22; border-radius: 12px; border: 1px solid #30363d;">
          <tr>
            <td style="padding: 32px;">
              <p style="color: #d4a855; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px 0;">Auto Invite</p>
              <h1 style="margin: 0 0 24px 0; color: #c9d1d9; font-size: 22px; font-weight: 600;">New availability submission</h1>

              <p style="color: #8b949e; line-height: 1.6; margin: 0 0 20px 0;">
                <strong style="color: #c9d1d9;">${escapeHtml(params.guestName)}</strong> has ${action} for your group availability request.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0d1117; border-radius: 8px; margin: 0 0 24px 0; border: 1px solid #30363d;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #30363d;">
                    <p style="margin: 0 0 4px 0; font-size: 12px; color: #8b949e; text-transform: uppercase;">Guest</p>
                    <p style="margin: 0; color: #c9d1d9;">${escapeHtml(params.guestName)}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px;">
                    <p style="margin: 0 0 4px 0; font-size: 12px; color: #8b949e; text-transform: uppercase;">Submitted</p>
                    <p style="margin: 0; color: #c9d1d9;">${escapeHtml(formattedTime)}</p>
                  </td>
                </tr>
              </table>

              <a href="${escapeHtml(params.adminUrl)}" style="display: block; background-color: #d4a855; color: #0d1117; text-decoration: none; padding: 14px 24px; border-radius: 8px; font-weight: 600; text-align: center;">
                View Admin Dashboard
              </a>
            </td>
          </tr>
        </table>
        <p style="color: #6e7681; font-size: 12px; margin-top: 16px;">Sent via Auto Invite</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendGroupGuestSubmissionNotification(env: Env, params: {
  requestId: string;
  hostName: string;
  hostEmail: string;
  guestName: string;
  adminUrl: string;
  submittedAt: string;
  isUpdate: boolean;
}): Promise<boolean> {
  if (!params.hostEmail) return false;

  const html = renderGroupGuestSubmissionEmail({
    hostName: params.hostName,
    guestName: params.guestName,
    requestId: params.requestId,
    adminUrl: params.adminUrl,
    submittedAt: params.submittedAt,
    isUpdate: params.isUpdate,
  });

  const action = params.isUpdate ? 'updated' : 'submitted';
  return sendEmail(env, {
    to: params.hostEmail,
    subject: `${params.guestName} ${action} availability for your group request`,
    html,
  });
}
