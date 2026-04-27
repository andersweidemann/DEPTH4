# DEPTH4 API — deploy to Render (free web) or any Docker host. PORT is set by the platform.
FROM python:3.12-slim-bookworm

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

COPY pyproject.toml ./
COPY signal_api ./signal_api

RUN pip install --upgrade pip setuptools wheel \
    && pip install .

EXPOSE 8000

CMD ["sh", "-c", "exec uvicorn signal_api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
