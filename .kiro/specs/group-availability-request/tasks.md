# Implementation Plan: Group Availability Request

## Overview

This implementation plan extends the existing Cloudflare Workers + Durable Objects architecture to support group availability coordination. The approach reuses existing infrastructure (Durable Object storage patterns, timezone handling utilities, WebSocket connections) while adding new storage keys, API endpoints, and aggregation logic.

The implementation follows an incremental approach: extend data types → add API endpoints → implement aggregation logic → add UI pages → integrate testing. Each step builds on previous work and validates functionality through tests.

## Tasks

- [x] 1. Extend type definitions and data models
  - Update `src/types.ts` with new types: `GuestInfo`, `GuestSubmission`, `GroupSubmissionsData`, `TimeSlot`, `AggregatedAvailability`
  - Extend `RequestData` type to include optional fields: `guests`, `participationThreshold`, `confirmed`
  - Add type guards for distinguishing request types
  - _Requirements: 1.5, 2.1, 2.4_

- [ ] 2. Implement token generation utilities
  - [x] 2.1 Add guest token generation function to `src/utils.ts`
    - Generate unique tokens for each guest in a request
    - Ensure tokens are URL-safe and unguessable (similar to existing `randomToken`)
    - _Requirements: 1.3, 1.4, 2.1_
  
  - [ ]* 2.2 Write property test for token uniqueness
    - **Property 7: Token uniqueness across request**
    - **Validates: Requirements 1.3, 1.4, 2.1**

- [ ] 3. Implement group request creation endpoint
  - [x] 3.1 Add `POST /api/group-request` handler in `src/handlers.ts`
    - Validate minimum 3 guests, maximum 50 guests
    - Validate unique email addresses
    - Validate date range (max 60 days)
    - Validate time windows (start < end)
    - Generate request ID, admin token, and guest tokens
    - Create Durable Object and store request data
    - Return admin URL and individual guest URLs
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.7, 14.5_
  
  - [ ]* 3.2 Write property tests for request creation validation
    - **Property 1: Minimum guest count enforcement**
    - **Property 2: Maximum guest count enforcement**
    - **Property 3: Date range validation**
    - **Property 4: Time window validation**
    - **Property 5: Email format validation**
    - **Validates: Requirements 1.1, 1.6, 1.7, 13.6, 14.5**
  
  - [ ]* 3.3 Write unit tests for request creation
    - Test successful creation with exactly 3 guests
    - Test successful creation with 50 guests
    - Test rejection with duplicate emails
    - Test URL generation format
    - _Requirements: 1.1, 1.2, 1.4_

- [ ] 4. Implement guest access endpoints
  - [x] 4.1 Add `GET /api/request/:id/guest?guest=:guestToken` handler
    - Validate guest token matches an invited guest
    - Return guest-specific view (name, request details, existing submission if any)
    - Do not expose other guests' information
    - _Requirements: 2.2, 2.5_
  
  - [x] 4.2 Extend existing `GET /api/request/:id` to support guest token parameter
    - Route to guest-specific view when guest token provided
    - Maintain backward compatibility for admin token
    - _Requirements: 2.2_
  
  - [ ]* 4.3 Write property test for guest data isolation
    - **Property 12: Guest data isolation**
    - **Validates: Requirements 2.2**

- [ ] 5. Implement guest submission endpoint
  - [x] 5.1 Add `POST /api/request/:id/guest-submit?guest=:guestToken` handler in Durable Object
    - Validate guest token
    - Validate availability ranges are non-overlapping
    - Validate ranges fall within allowed windows (after timezone conversion)
    - Reject empty submissions
    - Store submission in `"group-submissions"` storage key
    - Update existing submission if guest resubmits
    - Invalidate aggregation cache
    - Broadcast WebSocket notification to admin clients
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_
  
  - [ ]* 5.2 Write property tests for submission validation
    - **Property 14: Non-overlapping ranges validation**
    - **Property 16: Timezone storage invariant**
    - **Property 17: Allowed window boundary validation**
    - **Property 18: Submission update semantics**
    - **Validates: Requirements 3.2, 3.4, 3.5, 3.7**
  
  - [ ]* 5.3 Write unit tests for submission edge cases
    - Test empty submission rejection
    - Test submission after confirmation rejection
    - Test timezone conversion accuracy
    - _Requirements: 3.6, 7.5_

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement availability aggregation algorithm
  - [x] 7.1 Add `aggregateAvailability` function to `src/utils.ts`
    - Collect all unique time boundaries from submissions
    - For each interval between boundaries, count participants
    - Filter slots shorter than 30 minutes
    - Sort by participation count (descending), then by start time
    - Return `AggregatedAvailability` with slots and metadata
    - _Requirements: 5.2, 5.3, 6.1, 6.3, 6.6_
  
  - [ ]* 7.2 Write property tests for aggregation algorithm
    - **Property 22: Participation count accuracy**
    - **Property 23: Overlap calculation correctness**
    - **Property 24: Participant identification**
    - **Property 26: Participation sorting**
    - **Property 29: Minimum duration filtering**
    - **Validates: Requirements 5.2, 5.3, 5.5, 6.1, 6.3, 6.6**
  
  - [ ]* 7.3 Write unit tests for aggregation scenarios
    - Test with no overlapping availability
    - Test with full participation overlap
    - Test with partial participation overlap
    - Test with DST boundary crossing
    - _Requirements: 5.3, 6.2, 12.3_

- [ ] 8. Implement aggregated availability endpoint
  - [x] 8.1 Add `GET /api/request/:id/aggregated?admin=:adminToken` handler
    - Validate admin token
    - Check cache validity (use `"cache-timestamp"` storage key)
    - If cache valid, return cached `"aggregated-cache"`
    - If cache invalid, fetch submissions, compute aggregation, cache result
    - Include guest submission status (submitted vs pending)
    - Support optional `minParticipation` query parameter for filtering
    - _Requirements: 4.1, 4.5, 5.1, 6.5, 14.3_
  
  - [ ]* 8.2 Write property tests for aggregation endpoint
    - **Property 19: Submission status derivation**
    - **Property 20: Guest count invariant**
    - **Property 21: Admin dashboard data completeness**
    - **Property 28: Participation threshold filtering**
    - **Property 48: Aggregation cache invalidation**
    - **Validates: Requirements 4.1, 4.2, 4.4, 4.5, 6.5, 14.3**

- [ ] 9. Implement meeting confirmation endpoint
  - [x] 9.1 Add `POST /api/request/:id/confirm?admin=:adminToken` handler
    - Validate admin token
    - Validate required fields (startUtc, endUtc, title)
    - Validate confirmed slot overlaps with at least one guest's availability
    - Store confirmed slot in `"confirmed"` storage key
    - Set `confirmed: true` in request data
    - Send confirmation emails to guests (if feature flag enabled)
    - Broadcast WebSocket notification
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 8.5_
  
  - [ ]* 9.2 Write property tests for confirmation
    - **Property 30: Confirmation authorization**
    - **Property 31: Confirmation title requirement**
    - **Property 32: Confirmation optional fields**
    - **Property 33: Confirmation state transition**
    - **Property 34: Confirmation overlap validation**
    - **Property 35: Confirmation with disabled emails**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 8.5**
  
  - [ ]* 9.3 Write unit tests for confirmation scenarios
    - Test confirmation with all fields
    - Test confirmation with only required fields
    - Test rejection when no guest availability overlaps
    - Test rejection after already confirmed
    - _Requirements: 7.2, 7.3, 7.6_

- [ ] 10. Implement export functionality
  - [x] 10.1 Add `GET /api/request/:id/export.ics?admin=:adminToken` handler for group requests
    - Extend existing export handler to support group-availability type
    - Generate .ics file with all guest submissions as separate events
    - Include confirmed slot if present
    - Include guest names and timezones in event descriptions
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
  
  - [ ]* 10.2 Write property tests for export
    - **Property 36: Export completeness**
    - **Property 37: ICS format validity**
    - **Property 38: Export availability before confirmation**
    - **Property 39: Export includes confirmation**
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5**

- [ ] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Implement request management endpoints
  - [x] 12.1 Extend `PUT /api/request/:id?admin=:adminToken` to support group requests
    - Allow editing guest list, date range, time windows before submissions
    - Validate same rules as creation
    - _Requirements: 11.1_
  
  - [x] 12.2 Extend `DELETE /api/request/:id?admin=:adminToken` to prevent deletion of confirmed requests
    - Check if request has `confirmed: true`
    - Reject deletion with 400 error if confirmed
    - Delete all storage keys if not confirmed
    - _Requirements: 11.4, 11.5_
  
  - [ ]* 12.3 Write property tests for request management
    - **Property 40: Edit before submissions**
    - **Property 41: Deletion completeness**
    - **Property 42: Confirmed request deletion prevention**
    - **Validates: Requirements 11.1, 11.4, 11.5**

- [ ] 13. Implement WebSocket notifications for group requests
  - [x] 13.1 Extend WebSocket handler in Durable Object
    - Add notification types: `guest-submission` (new/updated)
    - Include guest name and token in notifications
    - Broadcast to all connected admin clients
    - _Requirements: 9.2, 9.3, 9.4_
  
  - [ ]* 13.2 Write integration tests for WebSocket notifications
    - Test notification delivery after guest submission
    - Test notification delivery after confirmation
    - Test multiple admin clients receive notifications
    - _Requirements: 9.2, 9.3_

- [ ] 14. Create host UI for group request creation
  - [ ] 14.1 Add `/new/group` page in `src/pages/` or inline in `src/worker.ts`
    - Form with host name, timezone, date range, time windows
    - Dynamic guest list (add/remove guests, minimum 3)
    - Email validation on client side
    - Submit to `POST /api/group-request`
    - Display admin URL and individual guest URLs after creation
    - _Requirements: 1.1, 1.2, 1.4_
  
  - [ ] 14.2 Update `/new` page to offer choice between individual and group requests
    - Add buttons or tabs for request type selection
    - Route to appropriate form
    - _Requirements: 1.5_

- [ ] 15. Create guest UI for availability submission
  - [ ] 15.1 Add guest view page at `/r/:id?guest=:guestToken`
    - Display guest name and request details
    - Show allowed dates and time windows in guest's local timezone
    - Interactive calendar/time picker for selecting availability
    - Validate non-overlapping ranges on client side
    - Submit to `POST /api/request/:id/guest-submit?guest=:guestToken`
    - Show existing submission if guest has already submitted
    - Allow updating submission
    - _Requirements: 2.2, 2.5, 3.1, 3.2_

- [ ] 16. Create host admin UI for aggregated availability
  - [ ] 16.1 Add admin view page at `/r/:id?admin=:adminToken` for group requests
    - Display list of invited guests with submission status
    - Show submitted vs pending counts
    - Display aggregated availability in calendar/grid format
    - Color-code time slots by participation count
    - Highlight full-participation slots
    - Show participant names on hover/click for each slot
    - Support filtering by minimum participation threshold
    - Establish WebSocket connection for real-time updates
    - _Requirements: 4.1, 4.5, 5.1, 5.2, 6.2, 6.3, 6.5, 9.1_
  
  - [ ] 16.2 Add confirmation UI in admin view
    - Allow selecting a time slot
    - Modal/form for entering meeting title, description, location
    - Submit to `POST /api/request/:id/confirm?admin=:adminToken`
    - Display confirmed meeting details after confirmation
    - Disable further submissions after confirmation
    - _Requirements: 7.1, 7.2, 7.3, 7.5_
  
  - [ ] 16.3 Add export button in admin view
    - Download .ics file with all availability
    - Link to `GET /api/request/:id/export.ics?admin=:adminToken`
    - _Requirements: 10.1_

- [ ] 17. Implement email notifications
  - [x] 17.1 Extend `src/email.ts` to support group request notifications
    - Add function for host notification when guest submits
    - Add function for guest confirmation notification
    - Include meeting details and .ics attachment in confirmation emails
    - Convert times to each recipient's timezone
    - Respect `EMAIL_CONFIRM_ENABLED` feature flag
    - _Requirements: 8.1, 8.2, 8.3, 8.5_
  
  - [ ]* 17.2 Write unit tests for email content
    - Test email includes correct timezone conversions
    - Test .ics attachment generation
    - Test feature flag behavior
    - _Requirements: 8.2, 8.3, 8.5_

- [ ] 18. Add comprehensive error handling
  - [x] 18.1 Add validation error messages to all endpoints
    - Return 400 with descriptive messages for validation failures
    - Return 403 for unauthorized actions
    - Return 404 for non-existent requests/guests
    - Return 409 for conflicts (already confirmed, etc.)
    - _Requirements: 13.1, 13.2, 13.3_
  
  - [x] 18.2 Add input sanitization for XSS prevention
    - Sanitize guest names, meeting titles, descriptions
    - Escape HTML special characters in all user inputs
    - _Requirements: 13.7_
  
  - [ ]* 18.3 Write property tests for error handling
    - **Property 45: Invalid input error codes**
    - **Property 46: Unauthorized action error codes**
    - **Property 47: XSS prevention**
    - **Validates: Requirements 13.1, 13.3, 13.7**

- [ ] 19. Implement timezone handling utilities
  - [x] 19.1 Add DST-aware timezone conversion functions to `src/utils.ts`
    - Use existing timezone libraries or Intl API
    - Handle DST transitions correctly
    - Validate IANA timezone identifiers
    - _Requirements: 12.3, 12.5_
  
  - [ ]* 19.2 Write property tests for timezone handling
    - **Property 6: Timezone identifier validation**
    - **Property 15: Timezone round-trip consistency**
    - **Property 43: UTC and IANA storage format**
    - **Property 44: DST-aware timezone conversion**
    - **Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5**
  
  - [ ]* 19.3 Write unit tests for DST edge cases
    - Test conversion across spring forward
    - Test conversion across fall back
    - Test with various IANA timezones
    - _Requirements: 12.3_

- [ ] 20. Implement concurrency safety
  - [ ] 20.1 Add transaction-like semantics for concurrent submissions
    - Use Durable Object's atomic storage operations
    - Ensure multiple guests can submit simultaneously without data loss
    - _Requirements: 14.4_
  
  - [ ]* 20.2 Write property test for concurrent submissions
    - **Property 49: Concurrent submission safety**
    - **Validates: Requirements 14.4**

- [ ] 21. Final checkpoint - Integration testing
  - [ ] 21.1 Test complete end-to-end flow
    - Create group request with 5 guests
    - Have 3 guests submit availability
    - View aggregated availability as host
    - Confirm a meeting time
    - Verify all guests receive confirmation emails
    - Export .ics file and verify contents
    - _Requirements: All_
  
  - [ ] 21.2 Test error scenarios
    - Attempt to submit after confirmation
    - Attempt to delete confirmed request
    - Attempt admin actions without token
    - Submit availability outside allowed windows
    - _Requirements: 7.5, 11.5, 13.3, 13.4_
  
  - [ ] 21.3 Test real-time updates
    - Open admin dashboard
    - Have guest submit in another browser
    - Verify WebSocket notification received
    - Verify aggregated view updates
    - _Requirements: 9.2, 9.3_

- [ ] 22. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (49 properties total)
- Unit tests validate specific examples and edge cases
- The implementation reuses existing infrastructure (Durable Objects, timezone utilities, WebSocket connections)
- All new code should follow existing patterns in `src/worker.ts`, `src/handlers.ts`, and `src/utils.ts`
- UI pages can be inlined in `src/worker.ts` or created as separate files in `src/pages/`
