import heapq
from dataclasses import dataclass

from poslite.shared.application.sync import Change


@dataclass(frozen=True, slots=True)
class PullPage:
    changes: list[Change]
    next_cursor: int
    has_more: bool


def merge_feeds(feeds: list[list[Change]], *, cursor: int, limit: int) -> PullPage:
    """Merge per-entity feeds, each already `version > cursor ORDER BY version LIMIT limit + 1`.

    Each feed holds its own smallest versions, so the first `limit` of the merge are the globally
    smallest. Versions follow commit order (ADR-009), so the cursor never skips a change.
    """
    merged = list(heapq.merge(*feeds, key=lambda c: c.version))
    page = merged[:limit]
    return PullPage(
        changes=page,
        next_cursor=page[-1].version if page else cursor,
        has_more=len(merged) > limit,
    )
