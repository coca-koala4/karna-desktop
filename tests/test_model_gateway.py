from types import SimpleNamespace

import hermes_cli.model_gateway as gateway


def test_deepseek_legacy_aliases_are_canonical():
    assert gateway.canonical_model("deepseek", "deepseek-v4.1-pro") == "deepseek-v4-pro"
    assert gateway.canonical_model("deepseek", "deepseek-v4.1-fast") == "deepseek-v4-flash"


def test_provider_errors_are_structured():
    unauthorized = RuntimeError("401 Unauthorized: invalid API key")
    assert gateway.classify_provider_error(unauthorized)["code"] == "key_invalid"
    missing = RuntimeError("model_not_found")
    assert gateway.classify_provider_error(missing)["code"] == "model_not_found"
    offline = RuntimeError("connection timed out")
    assert gateway.classify_provider_error(offline)["code"] == "network"


def test_validation_metadata_never_persists_secret(tmp_path, monkeypatch):
    monkeypatch.setattr(gateway, "get_hermes_home", lambda: tmp_path)
    secret = "sk-super-secret-value"
    saved = gateway.record_credential_status("DEEPSEEK_API_KEY", secret, status="valid")
    raw = (tmp_path / "model-validation.json").read_text(encoding="utf-8")
    assert secret not in raw
    assert saved["validated"] is True
    assert gateway.credential_status("DEEPSEEK_API_KEY", secret)["validation_status"] == "valid"
    assert gateway.credential_status("DEEPSEEK_API_KEY", secret + "changed")["validation_status"] == "pending"


def test_completion_uses_python_provider_router(monkeypatch):
    monkeypatch.setattr(gateway, "load_config", lambda: {"model": {"provider": "deepseek", "default": "deepseek-chat"}})
    response = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content="OK"))],
        usage=SimpleNamespace(prompt_tokens=2, completion_tokens=1, total_tokens=3),
    )
    create = lambda **kwargs: response
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))

    import agent.auxiliary_client as auxiliary

    monkeypatch.setattr(auxiliary, "resolve_provider_client", lambda *args, **kwargs: (client, "deepseek-chat"))
    result = gateway.complete_model_request(messages=[{"role": "user", "content": "hi"}])
    assert result["content"] == "OK"
    assert result["gateway"] == "python-hermes-model-gateway"
    assert result["fallback_used"] is False
    assert result["usage"] == {"input_tokens": 2, "output_tokens": 1, "total_tokens": 3}
