export type PlanningErrorCode =
  | "GOAL_NOT_FOUND"
  | "GOAL_TITLE_INVALID"
  | "GOAL_DESCRIPTION_INVALID"
  | "GOAL_TRACKING_INVALID"
  | "GOAL_CADENCE_INVALID"
  | "GOAL_TYPE_IMMUTABLE"
  | "ENTRY_DATE_INVALID"
  | "ENTRY_DATE_FUTURE"
  | "ENTRY_VALUE_INVALID"
  | "ENTRY_NOT_FOUND"
  | "GOAL_ORDER_MISMATCH";

export abstract class PlanningError extends Error {
  abstract readonly code: PlanningErrorCode;

  protected constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

export class GoalNotFoundError extends PlanningError {
  readonly code = "GOAL_NOT_FOUND";

  constructor() {
    super("An owned active goal lookup did not return a row.");
    this.name = "GoalNotFoundError";
  }
}

export class GoalTitleInvalidError extends PlanningError {
  readonly code = "GOAL_TITLE_INVALID";

  constructor() {
    super("A goal title violated its length invariant.");
    this.name = "GoalTitleInvalidError";
  }
}

export class GoalDescriptionInvalidError extends PlanningError {
  readonly code = "GOAL_DESCRIPTION_INVALID";

  constructor() {
    super("A goal description violated its length invariant.");
    this.name = "GoalDescriptionInvalidError";
  }
}

export class GoalTrackingInvalidError extends PlanningError {
  readonly code = "GOAL_TRACKING_INVALID";

  constructor() {
    super("A goal tracking definition is invalid.");
    this.name = "GoalTrackingInvalidError";
  }
}

export class GoalCadenceInvalidError extends PlanningError {
  readonly code = "GOAL_CADENCE_INVALID";

  constructor() {
    super("A goal cadence definition is invalid.");
    this.name = "GoalCadenceInvalidError";
  }
}

export class GoalTypeImmutableError extends PlanningError {
  readonly code = "GOAL_TYPE_IMMUTABLE";

  constructor() {
    super("A goal tracking type cannot be changed after creation.");
    this.name = "GoalTypeImmutableError";
  }
}

export class EntryDateInvalidError extends PlanningError {
  readonly code = "ENTRY_DATE_INVALID";

  constructor() {
    super("An entry date is outside the goal month.");
    this.name = "EntryDateInvalidError";
  }
}

export class EntryDateFutureError extends PlanningError {
  readonly code = "ENTRY_DATE_FUTURE";

  constructor() {
    super("An entry cannot be recorded for a future date.");
    this.name = "EntryDateFutureError";
  }
}

export class EntryValueInvalidError extends PlanningError {
  readonly code = "ENTRY_VALUE_INVALID";

  constructor() {
    super("An entry value does not match the goal tracking definition.");
    this.name = "EntryValueInvalidError";
  }
}

export class EntryNotFoundError extends PlanningError {
  readonly code = "ENTRY_NOT_FOUND";

  constructor() {
    super("An owned goal entry lookup did not return a row.");
    this.name = "EntryNotFoundError";
  }
}

export class GoalOrderMismatchError extends PlanningError {
  readonly code = "GOAL_ORDER_MISMATCH";

  constructor() {
    super("The submitted goal order does not match the active goals in this group.");
    this.name = "GoalOrderMismatchError";
  }
}
