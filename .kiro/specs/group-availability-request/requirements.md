# Requirements Document

## Introduction

The Group Availability Request feature enables coordination of meeting times among three or more participants. Unlike the existing one-to-one availability requests (where one host collects availability from one guest) and group event bookings (where multiple guests book individual slots from a fixed schedule), this feature allows a host to collect availability from multiple guests and identify overlapping time windows where all or most participants can meet.

The system will aggregate availability submissions from multiple guests, visualize overlaps, and help the host select an optimal meeting time that works for the maximum number of participants.

## Glossary

- **Host**: The person who creates the group availability request and ultimately selects the meeting time
- **Guest**: A participant invited to submit their availability (3 or more guests per request)
- **Group_Availability_Request**: A request type where multiple guests submit availability and the system identifies overlapping time windows
- **Availability_Submission**: Time ranges submitted by a guest indicating when they are available
- **Overlap_Window**: A time range where multiple guests have indicated availability
- **Participation_Threshold**: The minimum number of guests required to be available for a time slot to be considered viable
- **Aggregated_View**: A visualization showing all guest availability submissions overlaid to identify common free times
- **System**: The Auto-Invite Availability application running on Cloudflare Workers with Durable Objects

## Requirements

### Requirement 1: Create Group Availability Request

**User Story:** As a host, I want to create a group availability request for multiple guests, so that I can coordinate a meeting time that works for everyone.

#### Acceptance Criteria

1. WHEN a host creates a group availability request, THE System SHALL require a minimum of 3 guest entries (name and email for each)
2. WHEN a host creates a group availability request, THE System SHALL accept the host's name, host timezone, allowed date range, and optional time windows
3. WHEN a group availability request is created, THE System SHALL generate a unique request ID and admin token
4. WHEN a group availability request is created, THE System SHALL generate individual guest URLs for each invited participant
5. THE System SHALL store the request type as "group-availability" to distinguish it from one-to-one and group event types
6. WHEN a host creates a group availability request, THE System SHALL validate that the allowed date range does not exceed 60 days
7. WHEN time windows are provided, THE System SHALL validate that each window has valid start and end times with start before end

### Requirement 2: Guest Invitation and Access

**User Story:** As a host, I want each guest to receive their own unique link, so that I can track who has submitted availability and send reminders to non-responders.

#### Acceptance Criteria

1. WHEN a group availability request is created, THE System SHALL generate a unique guest token for each invited guest
2. WHEN a guest accesses their unique URL, THE System SHALL display their name and the request details without exposing other guests' information
3. WHEN a guest accesses their URL, THE System SHALL auto-detect their timezone using browser APIs
4. THE System SHALL associate each guest token with exactly one guest email and name
5. WHEN a guest has already submitted availability, THE System SHALL allow them to view and update their submission using the same URL

### Requirement 3: Guest Availability Submission

**User Story:** As a guest, I want to select multiple time ranges when I am available, so that the host can find a time that works for me and other participants.

#### Acceptance Criteria

1. WHEN a guest views the availability form, THE System SHALL display allowed dates and time windows converted to the guest's local timezone
2. WHEN a guest selects availability, THE System SHALL allow selection of multiple non-overlapping time ranges
3. WHEN a guest submits availability, THE System SHALL convert all selected times to UTC before storage
4. WHEN a guest submits availability, THE System SHALL store the guest's timezone (IANA format) along with their submission
5. WHEN a guest submits availability, THE System SHALL validate that all selected times fall within the host-defined allowed windows after timezone conversion
6. WHEN a guest submits empty availability, THE System SHALL reject the submission and display an error message
7. WHEN a guest updates their availability, THE System SHALL replace their previous submission and record the update timestamp

### Requirement 4: Submission Tracking

**User Story:** As a host, I want to see which guests have submitted their availability, so that I can follow up with those who haven't responded.

#### Acceptance Criteria

1. WHEN a host views the admin dashboard, THE System SHALL display a list of all invited guests with their submission status
2. WHEN a guest submits availability, THE System SHALL mark that guest's status as "submitted" with a timestamp
3. WHEN a guest updates their availability, THE System SHALL update the timestamp while maintaining "submitted" status
4. THE System SHALL display guests who have not submitted as "pending"
5. WHEN a host views the admin dashboard, THE System SHALL show the total count of submitted vs pending guests

### Requirement 5: Availability Aggregation

**User Story:** As a host, I want to see all guest availability overlaid on a single view, so that I can identify time slots where multiple people are available.

#### Acceptance Criteria

1. WHEN a host views the aggregated availability, THE System SHALL display all guest submissions converted to the host's timezone
2. WHEN displaying aggregated availability, THE System SHALL visually indicate the number of available guests for each time slot
3. WHEN multiple guests are available during overlapping times, THE System SHALL calculate and display the intersection of those time ranges
4. THE System SHALL display availability data in a calendar or grid format showing days and time slots
5. WHEN a host hovers over or selects a time slot, THE System SHALL display which specific guests are available during that time
6. THE System SHALL allow the host to toggle between viewing in host timezone and individual guest timezones

### Requirement 6: Optimal Time Identification

**User Story:** As a host, I want the system to highlight time slots where the most guests are available, so that I can quickly identify the best meeting times.

#### Acceptance Criteria

1. WHEN displaying aggregated availability, THE System SHALL calculate the participation count for each potential time slot
2. THE System SHALL visually highlight time slots where all invited guests are available
3. THE System SHALL display time slots sorted by participation count in descending order
4. WHEN no time slots have full participation, THE System SHALL highlight slots with the highest partial participation
5. THE System SHALL allow the host to filter time slots by minimum participation threshold
6. WHEN calculating overlaps, THE System SHALL only consider time ranges of at least 30 minutes duration

### Requirement 7: Meeting Time Confirmation

**User Story:** As a host, I want to select and confirm a meeting time from the available options, so that all participants are notified of the final decision.

#### Acceptance Criteria

1. WHEN a host selects a time slot from the aggregated view, THE System SHALL allow the host to confirm that slot as the final meeting time
2. WHEN confirming a meeting time, THE System SHALL require the host to provide a meeting title
3. WHEN confirming a meeting time, THE System SHALL allow the host to optionally provide a description and location
4. WHEN a meeting time is confirmed, THE System SHALL store the confirmed slot with start time, end time, title, description, location, and confirmation timestamp
5. WHEN a meeting time is confirmed, THE System SHALL mark the request as "confirmed" and prevent further availability submissions
6. THE System SHALL validate that the confirmed time slot falls within at least one guest's submitted availability

### Requirement 8: Guest Notification

**User Story:** As a guest, I want to be notified when the host confirms a meeting time, so that I can add it to my calendar.

#### Acceptance Criteria

1. WHEN a host confirms a meeting time, THE System SHALL send email notifications to all guests who were available during the confirmed slot
2. WHEN sending confirmation emails, THE System SHALL include the meeting time converted to each guest's timezone
3. WHEN sending confirmation emails, THE System SHALL include meeting title, description, location, and an .ics calendar attachment
4. WHEN a confirmed time slot does not include all guests, THE System SHALL send a different notification to unavailable guests informing them of the decision
5. IF email notifications are disabled via feature flag, THEN THE System SHALL skip sending emails but still store the confirmation

### Requirement 9: Real-Time Updates

**User Story:** As a host, I want to see availability submissions in real-time as guests respond, so that I don't need to refresh the page constantly.

#### Acceptance Criteria

1. WHEN a host has the admin dashboard open, THE System SHALL establish a WebSocket connection for real-time updates
2. WHEN a guest submits availability, THE System SHALL broadcast a notification to all connected admin WebSocket clients
3. WHEN a guest updates their availability, THE System SHALL broadcast an update notification to all connected admin WebSocket clients
4. THE System SHALL include the guest name and submission timestamp in WebSocket notifications
5. IF the WebSocket connection is lost, THEN THE System SHALL attempt to reconnect automatically

### Requirement 10: Data Export

**User Story:** As a host, I want to export all guest availability data, so that I can analyze it offline or share it with others.

#### Acceptance Criteria

1. WHEN a host requests an export, THE System SHALL generate a downloadable file containing all guest submissions
2. THE System SHALL support export in .ics format containing all submitted availability ranges as calendar events
3. WHEN exporting data, THE System SHALL include guest names, timezones, and availability ranges in both UTC and host timezone
4. THE System SHALL allow the host to export data before confirming a meeting time
5. WHEN a meeting time is confirmed, THE System SHALL include the confirmed slot in the export

### Requirement 11: Request Management

**User Story:** As a host, I want to edit or delete a group availability request, so that I can correct mistakes or cancel the coordination effort.

#### Acceptance Criteria

1. WHEN a host accesses the admin URL, THE System SHALL allow editing of the request details before any guest submissions
2. WHEN a host edits a request with existing submissions, THE System SHALL warn that changes may invalidate existing submissions
3. WHEN a host deletes a request, THE System SHALL require admin token authentication
4. WHEN a request is deleted, THE System SHALL remove all associated data including guest submissions and confirmed slots
5. THE System SHALL prevent deletion of a request after a meeting time has been confirmed

### Requirement 12: Timezone Handling

**User Story:** As a system architect, I want all timezone conversions to be accurate and consistent, so that guests and hosts see correct times in their local timezones.

#### Acceptance Criteria

1. THE System SHALL store all timestamps in UTC format
2. THE System SHALL store IANA timezone identifiers for the host and each guest
3. WHEN converting allowed windows to guest timezone, THE System SHALL account for daylight saving time transitions
4. WHEN displaying times to users, THE System SHALL convert from UTC to the user's timezone using their stored IANA identifier
5. THE System SHALL validate that all timezone identifiers are valid IANA timezone names before storage
6. WHEN a guest's browser timezone differs from their stored timezone, THE System SHALL use the stored timezone for consistency

### Requirement 13: Validation and Error Handling

**User Story:** As a developer, I want comprehensive validation and error handling, so that the system behaves predictably and provides clear feedback to users.

#### Acceptance Criteria

1. WHEN invalid data is submitted, THE System SHALL return a 400 status code with a descriptive error message
2. WHEN a guest attempts to access a non-existent request, THE System SHALL return a 404 status code
3. WHEN a user attempts an admin action without a valid admin token, THE System SHALL return a 403 status code
4. WHEN a guest submits availability outside allowed windows, THE System SHALL reject the submission with a specific error message
5. WHEN the system encounters a storage error, THE System SHALL return a 500 status code and log the error
6. THE System SHALL validate email addresses using standard email format validation
7. THE System SHALL sanitize all user input to prevent XSS attacks

### Requirement 14: Performance and Scalability

**User Story:** As a system administrator, I want the system to handle multiple concurrent requests efficiently, so that it remains responsive under load.

#### Acceptance Criteria

1. WHEN calculating availability overlaps, THE System SHALL complete the calculation within 2 seconds for up to 20 guests
2. WHEN generating the aggregated view, THE System SHALL optimize queries to minimize Durable Object storage reads
3. THE System SHALL cache aggregated availability calculations until a new submission is received
4. WHEN multiple guests submit simultaneously, THE System SHALL handle concurrent writes without data loss
5. THE System SHALL limit the maximum number of guests per request to 50 to ensure reasonable performance
