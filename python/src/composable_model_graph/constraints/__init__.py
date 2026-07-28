"""Deterministic structural constraints with lossless finding reports.

Constraints observe caller-projected relationships. They do not assign
severity, evaluation status, workflow action, or authority.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import (
    Any,
    Callable,
    Generic,
    Mapping,
    Optional,
    Sequence,
    TypeVar,
)

from ..core import (
    EvaluationResult,
    Evaluator,
    Evidence,
    RunContext,
    create_evaluator,
)

T = TypeVar("T")
P = TypeVar("P")
V = TypeVar("V")
L = TypeVar("L")
R = TypeVar("R")
F = TypeVar("F")


@dataclass(frozen=True)
class ConstraintContext:
    """Caller-controlled ambient information supplied to a constraint."""

    run_id: Optional[str] = None
    metadata: Optional[Mapping[str, Any]] = None


@dataclass(frozen=True)
class ConstraintFinding(Generic[F]):
    """Open, status-free observation emitted by a constraint."""

    kind: str
    code: str
    message: str
    path: Optional[Sequence[str | int]] = None
    observed: Any = None
    expected: Any = None
    evidence: Optional[Sequence[Evidence]] = None
    data: Optional[F] = None
    tags: Optional[Sequence[str]] = None


@dataclass(frozen=True)
class Constraint(Generic[T, F]):
    """A named check over caller-owned state."""

    id: str
    name: str
    check: Callable[[T, ConstraintContext], Sequence[F]]
    description: Optional[str] = None


@dataclass(frozen=True)
class ConstraintCheck(Generic[F]):
    """Findings retained for one executed constraint."""

    constraint_id: str
    constraint_name: str
    findings: Sequence[F]
    duration_ms: Optional[float] = None


@dataclass(frozen=True)
class ConstraintReport(Generic[F]):
    """Lossless, declaration-ordered result of executing constraints."""

    checks: Sequence[ConstraintCheck[F]]
    findings: Sequence[F]


@dataclass(frozen=True)
class ConstraintSuite(Generic[T, F]):
    """A reusable composition of constraints over the same input."""

    constraints: Sequence[Constraint[T, F]]

    def check(
        self,
        value: T,
        context: Optional[ConstraintContext] = None,
    ) -> ConstraintReport[F]:
        resolved_context = context if context is not None else ConstraintContext()
        checks: list[ConstraintCheck[F]] = []
        findings: list[F] = []
        for constraint in self.constraints:
            constraint_findings = list(constraint.check(value, resolved_context))
            checks.append(
                ConstraintCheck(
                    constraint_id=constraint.id,
                    constraint_name=constraint.name,
                    findings=constraint_findings,
                )
            )
            findings.extend(constraint_findings)
        return ConstraintReport(checks=checks, findings=findings)


def create_constraint(
    id: str,
    name: str,
    check: Callable[[T, ConstraintContext], Sequence[F]],
    description: Optional[str] = None,
) -> Constraint[T, F]:
    """Create a named constraint without assigning meaning to its findings."""

    return Constraint(id=id, name=name, check=check, description=description)


def compose_constraints(
    *constraints: Constraint[T, F],
) -> ConstraintSuite[T, F]:
    """Compose checks without short-circuiting, interpreting, or deduplicating."""

    return ConstraintSuite(constraints=list(constraints))


@dataclass(frozen=True)
class SelectedValue(Generic[V]):
    id: str
    value: V
    path: Optional[Sequence[str | int]] = None


@dataclass(frozen=True)
class SelectedReference:
    source: str
    target: str
    path: Optional[Sequence[str | int]] = None


@dataclass(frozen=True)
class SelectedMatch(Generic[L, R]):
    id: str
    left: L
    right: R
    path: Optional[Sequence[str | int]] = None


def _default_equals(left: Any, right: Any) -> bool:
    scalar_types = (str, int, float, bool, type(None))
    if type(left) is not type(right):
        return False
    if isinstance(left, scalar_types):
        return bool(left == right)
    return left is right


def predicate(
    *,
    id: str,
    test: Callable[[T, ConstraintContext], bool],
    finding: Callable[[T, ConstraintContext], F],
    name: Optional[str] = None,
    description: Optional[str] = None,
) -> Constraint[T, F]:
    """Emit one caller-defined finding when a predicate is false."""

    def check(value: T, context: ConstraintContext) -> Sequence[F]:
        return [] if test(value, context) else [finding(value, context)]

    return create_constraint(id, name or id, check, description)


def required(
    *,
    id: str,
    select: Callable[[T], Sequence[SelectedValue[Any]]],
    finding: Callable[[SelectedValue[Any]], F],
    name: Optional[str] = None,
    description: Optional[str] = None,
) -> Constraint[T, F]:
    """Emit one finding for each selected None value."""

    def check(value: T, _context: ConstraintContext) -> Sequence[F]:
        return [finding(item) for item in select(value) if item.value is None]

    return create_constraint(id, name or id, check, description)


def distinct(
    *,
    id: str,
    select: Callable[[T], Sequence[SelectedValue[V]]],
    finding: Callable[[Sequence[SelectedValue[V]]], F],
    equals: Optional[Callable[[V, V], bool]] = None,
    name: Optional[str] = None,
    description: Optional[str] = None,
) -> Constraint[T, F]:
    """Emit one finding containing every item involved in a duplicate."""

    compare = equals if equals is not None else _default_equals

    def check(value: T, _context: ConstraintContext) -> Sequence[F]:
        items = list(select(value))
        duplicate_indexes: set[int] = set()
        for left in range(len(items)):
            for right in range(left + 1, len(items)):
                if compare(items[left].value, items[right].value):
                    duplicate_indexes.add(left)
                    duplicate_indexes.add(right)
        if not duplicate_indexes:
            return []
        duplicates = [
            item for index, item in enumerate(items) if index in duplicate_indexes
        ]
        return [finding(duplicates)]

    return create_constraint(id, name or id, check, description)


def references_exist(
    *,
    id: str,
    records: Callable[[T], Sequence[R]],
    record_id: Callable[[R], str],
    references: Callable[[T], Sequence[SelectedReference]],
    finding: Callable[[SelectedReference], F],
    name: Optional[str] = None,
    description: Optional[str] = None,
) -> Constraint[T, F]:
    """Emit one finding for each reference whose target record is absent."""

    def check(value: T, _context: ConstraintContext) -> Sequence[F]:
        known = {record_id(record) for record in records(value)}
        return [
            finding(reference)
            for reference in references(value)
            if reference.target not in known
        ]

    return create_constraint(id, name or id, check, description)


def reachable(
    *,
    id: str,
    starts: Callable[[T], Sequence[str]],
    goals: Callable[[T], Sequence[str]],
    neighbors: Callable[[str, T], Sequence[str]],
    finding: Callable[[Sequence[str], str], F],
    name: Optional[str] = None,
    description: Optional[str] = None,
) -> Constraint[T, F]:
    """Emit one finding for every goal unreachable from all selected starts."""

    def check(value: T, _context: ConstraintContext) -> Sequence[F]:
        start_ids = list(starts(value))
        visited = set(start_ids)
        queue = deque(start_ids)
        while queue:
            current = queue.popleft()
            for neighbor in neighbors(current, value):
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)
        return [
            finding(start_ids, goal)
            for goal in goals(value)
            if goal not in visited
        ]

    return create_constraint(id, name or id, check, description)


def within_range(
    *,
    id: str,
    select: Callable[[T], Sequence[SelectedValue[float]]],
    minimum: float,
    maximum: float,
    finding: Callable[[SelectedValue[float], float, float], F],
    name: Optional[str] = None,
    description: Optional[str] = None,
) -> Constraint[T, F]:
    """Emit one finding for each number outside the inclusive range."""

    if minimum > maximum:
        raise ValueError(
            f"constraint range minimum {minimum} exceeds maximum {maximum}"
        )

    def check(value: T, _context: ConstraintContext) -> Sequence[F]:
        return [
            finding(item, minimum, maximum)
            for item in select(value)
            if item.value < minimum or item.value > maximum
        ]

    return create_constraint(id, name or id, check, description)


def matches(
    *,
    id: str,
    select: Callable[[T], Sequence[SelectedMatch[L, R]]],
    finding: Callable[[SelectedMatch[L, R]], F],
    equals: Optional[Callable[[L, R], bool]] = None,
    name: Optional[str] = None,
    description: Optional[str] = None,
) -> Constraint[T, F]:
    """Emit one finding for each selected pair that does not match."""

    compare = equals if equals is not None else _default_equals

    def check(value: T, _context: ConstraintContext) -> Sequence[F]:
        return [
            finding(item)
            for item in select(value)
            if not compare(item.left, item.right)
        ]

    return create_constraint(id, name or id, check, description)


def project(
    *,
    constraint: Constraint[P, F],
    select: Callable[[T], P],
    id: Optional[str] = None,
    name: Optional[str] = None,
    description: Optional[str] = None,
) -> Constraint[T, F]:
    """Adapt caller-owned state into an existing constraint input."""

    def check(value: T, context: ConstraintContext) -> Sequence[F]:
        return constraint.check(select(value), context)

    return create_constraint(
        id or constraint.id,
        name or constraint.name,
        check,
        description if description is not None else constraint.description,
    )


def create_constraint_evaluator(
    *,
    constraints: ConstraintSuite[T, F],
    interpret: Callable[
        [ConstraintReport[F], T, Any, RunContext],
        EvaluationResult,
    ],
    id: str = "constraints",
    name: str = "Constraints",
) -> Evaluator:
    """Adapt findings to evaluation only through caller interpretation."""

    def evaluate(output: T, target: Any, context: RunContext) -> EvaluationResult:
        report = constraints.check(
            output,
            ConstraintContext(
                run_id=context.run_id,
                metadata=context.metadata,
            ),
        )
        return interpret(report, output, target, context)

    return create_evaluator(id=id, name=name, evaluate=evaluate)


__all__ = [
    "ConstraintContext",
    "ConstraintFinding",
    "Constraint",
    "ConstraintCheck",
    "ConstraintReport",
    "ConstraintSuite",
    "SelectedValue",
    "SelectedReference",
    "SelectedMatch",
    "create_constraint",
    "compose_constraints",
    "create_constraint_evaluator",
    "predicate",
    "required",
    "distinct",
    "references_exist",
    "reachable",
    "within_range",
    "matches",
    "project",
]
