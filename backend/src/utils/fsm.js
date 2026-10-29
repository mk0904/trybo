// Finite State Machine (FSM) for Trybo Order Lifecycle
// Ensures orders cannot skip steps or enter invalid states.

export const ALLOWED_TRANSITIONS = {
  SEARCHING_RIDER: ['RIDER_ASSIGNED', 'CANCELLED'],
  RIDER_ASSIGNED: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['AT_DOORSTEP'],
  AT_DOORSTEP: ['TRY_IN_PROGRESS'],
  TRY_IN_PROGRESS: ['DECISION_SUBMITTED'],
  DECISION_SUBMITTED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(currentStatus, nextStatus) {
  const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
  return allowed.includes(nextStatus);
}

// Generate a random 4-digit OTP string (e.g., "4821")
export function generateOtp() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}
