import type { MaybePromise } from "@composable-model-graph/core";

import { createConstraint } from "./factory.js";
import type {
  Constraint,
  ConstraintContext,
  ConstraintFinding,
} from "./types.js";

interface NamedConstraintOptions {
  id: string;
  name?: string;
  description?: string;
}

function defaultEquals(left: unknown, right: unknown): boolean {
  return left === right;
}

/** A caller-selected value with stable identity and optional source path. */
export interface SelectedValue<V> {
  id: string;
  value: V;
  path?: ReadonlyArray<string | number>;
}

/** A caller-selected reference between two stable identifiers. */
export interface SelectedReference {
  source: string;
  target: string;
  path?: ReadonlyArray<string | number>;
}

/** A caller-selected pair whose values should match. */
export interface SelectedMatch<L, R = L> {
  id: string;
  left: L;
  right: R;
  path?: ReadonlyArray<string | number>;
}

export interface PredicateOptions<T, F> extends NamedConstraintOptions {
  test(value: T, context: ConstraintContext): MaybePromise<boolean>;
  finding(value: T, context: ConstraintContext): F;
}

/** Emit one caller-defined finding when a predicate is false. */
export function predicate<T, F = ConstraintFinding>(
  options: PredicateOptions<T, F>,
): Constraint<T, F> {
  return createConstraint({
    id: options.id,
    name: options.name ?? options.id,
    description: options.description,
    check: async (value, context) =>
      (await options.test(value, context))
        ? []
        : [options.finding(value, context)],
  });
}

export interface RequiredOptions<T, V, F> extends NamedConstraintOptions {
  select(value: T): ReadonlyArray<SelectedValue<V | null | undefined>>;
  finding(details: { item: SelectedValue<V | null | undefined> }): F;
}

/** Emit one finding for each selected null or undefined value. */
export function required<T, V, F = ConstraintFinding>(
  options: RequiredOptions<T, V, F>,
): Constraint<T, F> {
  return createConstraint({
    id: options.id,
    name: options.name ?? options.id,
    description: options.description,
    check: (value) =>
      options
        .select(value)
        .filter((item) => item.value === null || item.value === undefined)
        .map((item) => options.finding({ item })),
  });
}

export interface DistinctOptions<T, V, F> extends NamedConstraintOptions {
  select(value: T): ReadonlyArray<SelectedValue<V>>;
  equals?(left: V, right: V): boolean;
  finding(details: { duplicates: ReadonlyArray<SelectedValue<V>> }): F;
}

/**
 * Emit one finding containing every selected item participating in a duplicate
 * relationship. Each item appears at most once and selector order is retained.
 */
export function distinct<T, V, F = ConstraintFinding>(
  options: DistinctOptions<T, V, F>,
): Constraint<T, F> {
  const equals = options.equals ?? defaultEquals;
  return createConstraint({
    id: options.id,
    name: options.name ?? options.id,
    description: options.description,
    check: (value) => {
      const items = options.select(value);
      const duplicateIndexes = new Set<number>();
      for (let left = 0; left < items.length; left += 1) {
        for (let right = left + 1; right < items.length; right += 1) {
          if (equals(items[left]!.value, items[right]!.value)) {
            duplicateIndexes.add(left);
            duplicateIndexes.add(right);
          }
        }
      }
      if (duplicateIndexes.size === 0) return [];
      const duplicates = items.filter((_, index) =>
        duplicateIndexes.has(index),
      );
      return [options.finding({ duplicates })];
    },
  });
}

export interface ReferencesExistOptions<T, R, F>
  extends NamedConstraintOptions {
  records(value: T): ReadonlyArray<R>;
  recordId(record: R): string;
  references(value: T): ReadonlyArray<SelectedReference>;
  finding(details: { reference: SelectedReference }): F;
}

/** Emit one finding for each reference whose target record is absent. */
export function referencesExist<T, R, F = ConstraintFinding>(
  options: ReferencesExistOptions<T, R, F>,
): Constraint<T, F> {
  return createConstraint({
    id: options.id,
    name: options.name ?? options.id,
    description: options.description,
    check: (value) => {
      const known = new Set(
        options.records(value).map((record) => options.recordId(record)),
      );
      return options
        .references(value)
        .filter((reference) => !known.has(reference.target))
        .map((reference) => options.finding({ reference }));
    },
  });
}

export interface ReachableOptions<T, F> extends NamedConstraintOptions {
  starts(value: T): ReadonlyArray<string>;
  goals(value: T): ReadonlyArray<string>;
  neighbors(id: string, value: T): ReadonlyArray<string>;
  finding(details: {
    starts: ReadonlyArray<string>;
    goal: string;
  }): F;
}

/** Emit one finding for every goal unreachable from all selected starts. */
export function reachable<T, F = ConstraintFinding>(
  options: ReachableOptions<T, F>,
): Constraint<T, F> {
  return createConstraint({
    id: options.id,
    name: options.name ?? options.id,
    description: options.description,
    check: (value) => {
      const starts = [...options.starts(value)];
      const visited = new Set(starts);
      const queue = [...starts];
      while (queue.length > 0) {
        const id = queue.shift()!;
        for (const neighbor of options.neighbors(id, value)) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
      return options
        .goals(value)
        .filter((goal) => !visited.has(goal))
        .map((goal) => options.finding({ starts, goal }));
    },
  });
}

export interface WithinRangeOptions<T, F> extends NamedConstraintOptions {
  select(value: T): ReadonlyArray<SelectedValue<number>>;
  min: number;
  max: number;
  finding(details: {
    item: SelectedValue<number>;
    min: number;
    max: number;
  }): F;
}

/** Emit one finding for each selected number outside the inclusive range. */
export function withinRange<T, F = ConstraintFinding>(
  options: WithinRangeOptions<T, F>,
): Constraint<T, F> {
  if (options.min > options.max) {
    throw new Error(
      `constraint range minimum ${options.min} exceeds maximum ${options.max}`,
    );
  }
  return createConstraint({
    id: options.id,
    name: options.name ?? options.id,
    description: options.description,
    check: (value) =>
      options
        .select(value)
        .filter(
          (item) => item.value < options.min || item.value > options.max,
        )
        .map((item) =>
          options.finding({ item, min: options.min, max: options.max }),
        ),
  });
}

export interface MatchesOptions<T, L, R, F>
  extends NamedConstraintOptions {
  select(value: T): ReadonlyArray<SelectedMatch<L, R>>;
  equals?(left: L, right: R): boolean;
  finding(details: { item: SelectedMatch<L, R> }): F;
}

/** Emit one finding for each caller-selected pair that does not match. */
export function matches<T, L, R = L, F = ConstraintFinding>(
  options: MatchesOptions<T, L, R, F>,
): Constraint<T, F> {
  const equals =
    options.equals ??
    ((left: L, right: R): boolean => defaultEquals(left, right));
  return createConstraint({
    id: options.id,
    name: options.name ?? options.id,
    description: options.description,
    check: (value) =>
      options
        .select(value)
        .filter((item) => !equals(item.left, item.right))
        .map((item) => options.finding({ item })),
  });
}

export interface ProjectOptions<T, P, F> {
  constraint: Constraint<P, F>;
  select(value: T): P;
  id?: string;
  name?: string;
  description?: string;
}

/** Adapt caller-owned state into an existing constraint input. */
export function project<T, P, F = ConstraintFinding>(
  options: ProjectOptions<T, P, F>,
): Constraint<T, F> {
  return createConstraint({
    id: options.id ?? options.constraint.id,
    name: options.name ?? options.constraint.name,
    description: options.description ?? options.constraint.description,
    check: (value, context) =>
      options.constraint.check(options.select(value), context),
  });
}
