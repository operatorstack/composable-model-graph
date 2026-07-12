"""Internal: format numbers the way JavaScript stringifies them.

JS `String(1)` and `String(1.0)` are both "1"; Python `str(1.0)` is "1.0".
Messages and comparison reasons embed numbers, and dual-language examples
assert byte-identical output — so Python formats numbers the JS way.
"""

from __future__ import annotations


def format_number(value: float) -> str:
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)
