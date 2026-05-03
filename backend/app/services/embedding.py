from __future__ import annotations

import logging

from sentence_transformers import SentenceTransformer
import torch

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmbeddingService:
    def __init__(self) -> None:
        self.provider = settings.embedding_provider
        self.model_name = settings.embedding_model
        self.device_pref = settings.embedding_device.lower().strip()
        self._model: SentenceTransformer | None = None

    def _resolve_device(self) -> str:
        if self.device_pref in {"cpu", "cuda", "mps"}:
            return self.device_pref
        if self.device_pref != "auto":
            logger.warning(
                "[embedding] invalid EMBEDDING_DEVICE=%s, fallback to auto", self.device_pref
            )

        if torch.cuda.is_available():
            return "cuda"

        mps_backend = getattr(torch.backends, "mps", None)
        if mps_backend and mps_backend.is_available():
            return "mps"

        return "cpu"

    def _ensure_model(self) -> SentenceTransformer:
        if self.provider != "sentence_transformers":
            raise RuntimeError(f"Unsupported embedding provider: {self.provider}")
        if self._model is None:
            device = self._resolve_device()
            logger.info("[embedding] loading model: %s (device=%s)", self.model_name, device)
            self._model = SentenceTransformer(self.model_name, device=device)
        return self._model

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        model = self._ensure_model()
        vectors = model.encode(
            texts,
            batch_size=64,
            convert_to_numpy=True,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return vectors.tolist()


embedding_service = EmbeddingService()
