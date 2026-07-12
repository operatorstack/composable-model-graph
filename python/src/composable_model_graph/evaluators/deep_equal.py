"""Structural equality for primitives, lists, and plain dicts.

(Python parity of typescript evaluators/deep-equal.ts.)
"""

from __future__ import annotations

import math
from typing import Any


def deep_equal(a: Any, b: Any) -> bool:
    # Mirror of JS Object.is: NaN equals NaN; booleans are their own type,
    # so True != 1 (bool is an int subclass in Python — guard it explicitly).
    if isinstance(a, bool) or isinstance(b, bool):
        return isinstance(a, bool) and isinstance(b, bool) and a is b
    if isinstance(a, float) and isinstance(b, float):
        if math.isnan(a) and math.isnan(b):
            return True
    if type(a) is type(b) and not isinstance(a, (list, dict)) and a == b:
        return True
    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and a == b:
        return True
    if not isinstance(a, (list, dict)) or not isinstance(b, (list, dict)):
        return False

    a_is_list = isinstance(a, list)
    b_is_list = isinstance(b, list)
    if a_is_list or b_is_list:
        if not a_is_list or not b_is_list or len(a) != len(b):
            return False
        return all(deep_equal(value, b[index]) for index, value in enumerate(a))

    if len(a) != len(b):
        return False
    return all(key in b and deep_equal(value, b[key]) for key, value in a.items())
