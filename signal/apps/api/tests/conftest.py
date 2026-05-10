from __future__ import annotations

import pytest

from signal_api.ai import model_budget
from signal_api.ai import llm_client
from signal_api.config import get_settings


@pytest.fixture(autouse=True)
def _reset_llm_test_isolation():
  get_settings.cache_clear()
  model_budget.reset_for_tests()
  llm_client.clear_completion_cache()
  yield
  get_settings.cache_clear()
  model_budget.reset_for_tests()
  llm_client.clear_completion_cache()
