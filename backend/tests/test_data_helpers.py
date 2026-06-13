import pytest

from app.utils.data_helpers import deduplicate, validate_input


class TestValidateInput:
    def test_none_returns_false(self):
        assert validate_input(None) is False

    def test_empty_string_returns_false(self):
        assert validate_input("") is False

    def test_empty_list_returns_false(self):
        assert validate_input([]) is False

    def test_non_empty_string_returns_true(self):
        assert validate_input("hello") is True

    def test_non_empty_list_returns_true(self):
        assert validate_input([1, 2]) is True

    def test_integer_returns_true(self):
        assert validate_input(0) is True

    def test_dict_returns_true(self):
        assert validate_input({"a": 1}) is True


class TestDeduplicate:
    def test_empty_list(self):
        assert deduplicate([]) == []

    def test_no_duplicates(self):
        assert deduplicate([1, 2, 3]) == [1, 2, 3]

    def test_duplicate_primitives(self):
        assert deduplicate([1, 2, 1, 3, 2]) == [1, 2, 3]

    def test_preserves_order(self):
        assert deduplicate([3, 1, 2, 1, 3]) == [3, 1, 2]

    def test_duplicate_dicts(self):
        items = [{"a": 1}, {"b": 2}, {"a": 1}]
        assert deduplicate(items) == [{"a": 1}, {"b": 2}]

    def test_dicts_different_values(self):
        items = [{"a": 1}, {"a": 2}]
        assert deduplicate(items) == [{"a": 1}, {"a": 2}]

    def test_mixed_types(self):
        items = [1, "x", 1, "x"]
        assert deduplicate(items) == [1, "x"]
