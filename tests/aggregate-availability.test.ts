import { describe, it, expect } from 'vitest';
import { aggregateAvailability } from '../src/utils';
import type { GuestSubmission } from '../src/types';

describe('aggregateAvailability', () => {
  it('should return empty result for no submissions', () => {
    const result = aggregateAvailability([]);
    
    expect(result.slots).toEqual([]);
    expect(result.totalGuests).toBe(0);
    expect(result.submittedCount).toBe(0);
    expect(result.maxParticipation).toBe(0);
  });

  it('should aggregate single guest availability', () => {
    const submissions: GuestSubmission[] = [
      {
        guestToken: 'guest_1',
        availability: [
          { startUtc: '2024-03-05T14:00:00Z', endUtc: '2024-03-05T16:00:00Z' }
        ],
        guestTimezone: 'America/New_York',
        submittedAt: '2024-02-16T08:30:00Z'
      }
    ];

    const result = aggregateAvailability(submissions);

    expect(result.slots).toHaveLength(1);
    expect(result.slots[0].startUtc).toBe('2024-03-05T14:00:00.000Z');
    expect(result.slots[0].endUtc).toBe('2024-03-05T16:00:00.000Z');
    expect(result.slots[0].participantCount).toBe(1);
    expect(result.slots[0].participantTokens).toEqual(['guest_1']);
    expect(result.totalGuests).toBe(1);
    expect(result.maxParticipation).toBe(1);
  });

  it('should find overlapping availability between two guests', () => {
    const submissions: GuestSubmission[] = [
      {
        guestToken: 'guest_1',
        availability: [
          { startUtc: '2024-03-05T14:00:00Z', endUtc: '2024-03-05T16:00:00Z' }
        ],
        guestTimezone: 'America/New_York',
        submittedAt: '2024-02-16T08:30:00Z'
      },
      {
        guestToken: 'guest_2',
        availability: [
          { startUtc: '2024-03-05T14:30:00Z', endUtc: '2024-03-05T18:00:00Z' }
        ],
        guestTimezone: 'Europe/London',
        submittedAt: '2024-02-16T09:15:00Z'
      }
    ];

    const result = aggregateAvailability(submissions);

    // Should have 3 slots: 14:00-14:30 (1 guest), 14:30-16:00 (2 guests), 16:00-18:00 (1 guest)
    expect(result.slots).toHaveLength(3);
    
    // First slot should be the overlap with 2 participants (sorted by participation count)
    expect(result.slots[0].participantCount).toBe(2);
    expect(result.slots[0].startUtc).toBe('2024-03-05T14:30:00.000Z');
    expect(result.slots[0].endUtc).toBe('2024-03-05T16:00:00.000Z');
    expect(result.slots[0].participantTokens).toEqual(['guest_1', 'guest_2']);
    
    expect(result.maxParticipation).toBe(2);
    expect(result.totalGuests).toBe(2);
  });

  it('should filter out slots shorter than 30 minutes', () => {
    const submissions: GuestSubmission[] = [
      {
        guestToken: 'guest_1',
        availability: [
          { startUtc: '2024-03-05T14:00:00Z', endUtc: '2024-03-05T14:15:00Z' } // 15 min
        ],
        guestTimezone: 'America/New_York',
        submittedAt: '2024-02-16T08:30:00Z'
      }
    ];

    const result = aggregateAvailability(submissions);

    // Should be filtered out because it's less than 30 minutes
    expect(result.slots).toHaveLength(0);
  });

  it('should include slots exactly 30 minutes long', () => {
    const submissions: GuestSubmission[] = [
      {
        guestToken: 'guest_1',
        availability: [
          { startUtc: '2024-03-05T14:00:00Z', endUtc: '2024-03-05T14:30:00Z' } // exactly 30 min
        ],
        guestTimezone: 'America/New_York',
        submittedAt: '2024-02-16T08:30:00Z'
      }
    ];

    const result = aggregateAvailability(submissions);

    expect(result.slots).toHaveLength(1);
    expect(result.slots[0].participantCount).toBe(1);
  });

  it('should sort by participation count descending, then by start time ascending', () => {
    const submissions: GuestSubmission[] = [
      {
        guestToken: 'guest_1',
        availability: [
          { startUtc: '2024-03-05T10:00:00Z', endUtc: '2024-03-05T12:00:00Z' },
          { startUtc: '2024-03-05T14:00:00Z', endUtc: '2024-03-05T16:00:00Z' }
        ],
        guestTimezone: 'America/New_York',
        submittedAt: '2024-02-16T08:30:00Z'
      },
      {
        guestToken: 'guest_2',
        availability: [
          { startUtc: '2024-03-05T14:30:00Z', endUtc: '2024-03-05T18:00:00Z' }
        ],
        guestTimezone: 'Europe/London',
        submittedAt: '2024-02-16T09:15:00Z'
      },
      {
        guestToken: 'guest_3',
        availability: [
          { startUtc: '2024-03-05T15:00:00Z', endUtc: '2024-03-05T17:00:00Z' }
        ],
        guestTimezone: 'Asia/Tokyo',
        submittedAt: '2024-02-16T10:00:00Z'
      }
    ];

    const result = aggregateAvailability(submissions);

    // First slot should have highest participation (3 guests)
    expect(result.slots[0].participantCount).toBe(3);
    expect(result.slots[0].startUtc).toBe('2024-03-05T15:00:00.000Z');
    expect(result.slots[0].endUtc).toBe('2024-03-05T16:00:00.000Z');
    
    // Among slots with same participation, earlier time comes first
    const twoParticipantSlots = result.slots.filter(s => s.participantCount === 2);
    if (twoParticipantSlots.length > 1) {
      expect(Date.parse(twoParticipantSlots[0].startUtc))
        .toBeLessThan(Date.parse(twoParticipantSlots[1].startUtc));
    }
  });

  it('should handle multiple non-overlapping availability ranges from same guest', () => {
    const submissions: GuestSubmission[] = [
      {
        guestToken: 'guest_1',
        availability: [
          { startUtc: '2024-03-05T09:00:00Z', endUtc: '2024-03-05T11:00:00Z' },
          { startUtc: '2024-03-05T14:00:00Z', endUtc: '2024-03-05T16:00:00Z' }
        ],
        guestTimezone: 'America/New_York',
        submittedAt: '2024-02-16T08:30:00Z'
      }
    ];

    const result = aggregateAvailability(submissions);

    expect(result.slots).toHaveLength(2);
    expect(result.slots.every(s => s.participantCount === 1)).toBe(true);
  });

  it('should correctly identify participants for each slot', () => {
    const submissions: GuestSubmission[] = [
      {
        guestToken: 'guest_alice',
        availability: [
          { startUtc: '2024-03-05T14:00:00Z', endUtc: '2024-03-05T16:00:00Z' }
        ],
        guestTimezone: 'America/New_York',
        submittedAt: '2024-02-16T08:30:00Z'
      },
      {
        guestToken: 'guest_bob',
        availability: [
          { startUtc: '2024-03-05T14:30:00Z', endUtc: '2024-03-05T17:00:00Z' }
        ],
        guestTimezone: 'Europe/London',
        submittedAt: '2024-02-16T09:15:00Z'
      },
      {
        guestToken: 'guest_carol',
        availability: [
          { startUtc: '2024-03-05T15:00:00Z', endUtc: '2024-03-05T18:00:00Z' }
        ],
        guestTimezone: 'Asia/Tokyo',
        submittedAt: '2024-02-16T10:00:00Z'
      }
    ];

    const result = aggregateAvailability(submissions);

    // Find the slot with all 3 participants
    const fullSlot = result.slots.find(s => s.participantCount === 3);
    expect(fullSlot).toBeDefined();
    expect(fullSlot!.participantTokens).toContain('guest_alice');
    expect(fullSlot!.participantTokens).toContain('guest_bob');
    expect(fullSlot!.participantTokens).toContain('guest_carol');
  });
});
