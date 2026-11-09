"""Run with: python3 tests/test_server.py"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import server

items = [{"id": "a", "deck": "D"}, {"id": "b", "deck": "D"}, {"id": "c", "deck": "D"}, {"id": "z", "deck": "Other"}]
now = 1000.0
state = {}
assert server.choose_next(items, state, "D", [], now)[0]["id"] == "a"
assert server.choose_next(items, state, "D", ["a"], now, {"a"})[0]["id"] == "b"
server.update_review(state, "a", 40, now)           # bad -> level 0, back in 3 min
assert state["a"]["level"] == 0 and state["a"]["due"] == now + 180
assert server.choose_next(items, state, "D", ["b"], now + 200, {"a", "b"}) == (items[0], "review")
server.update_review(state, "b", 95, now)           # good -> level 1 (1 day)
server.update_review(state, "b", 95, now)           # good again -> level 2 (3 days)
assert state["b"]["level"] == 2 and state["b"]["due"] == now + 3 * 86400
server.update_review(state, "b", 70, now)           # medium -> drops one level
assert state["b"]["level"] == 1
assert server.choose_next(items, state, "Other", [], now)[0]["id"] == "z"
assert server.key_looks_valid("0123456789abcdef0123456789abcdef")
assert not server.key_looks_valid("paste-KEY-1-here")
print("ALL SERVER TESTS PASSED")
