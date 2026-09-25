from poslite.shared.application.sync import Change
from poslite.sync.application.pull_changes import merge_feeds


def _c(entity: str, version: int) -> Change:
    return Change(entity=entity, op="upsert", id=f"{entity}-{version}", version=version, data={})


def test_merges_feeds_in_version_order() -> None:
    page = merge_feeds(
        [[_c("product", 3), _c("product", 7)], [_c("user", 1), _c("user", 9)]], cursor=0, limit=10
    )

    assert [c.version for c in page.changes] == [1, 3, 7, 9]
    assert (page.next_cursor, page.has_more) == (9, False)


def test_cuts_at_the_limit_and_reports_more() -> None:
    page = merge_feeds(
        [[_c("product", 3), _c("product", 7)], [_c("user", 1), _c("user", 9)]], cursor=0, limit=3
    )

    assert [c.version for c in page.changes] == [1, 3, 7]
    assert (page.next_cursor, page.has_more) == (7, True)


def test_keeps_the_cursor_when_nothing_changed() -> None:
    page = merge_feeds([[], []], cursor=42, limit=10)

    assert (page.changes, page.next_cursor, page.has_more) == ([], 42, False)
