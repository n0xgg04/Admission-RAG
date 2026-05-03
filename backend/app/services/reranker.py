from __future__ import annotations

import logging

from sentence_transformers import CrossEncoder

from app.core.config import settings

logger = logging.getLogger(__name__)


class RerankerService:
    def __init__(self) -> None:
        self.enabled = bool(settings.reranker_enabled)
        self.model_name = settings.reranker_model
        self.device = settings.reranker_device
        self.batch_size = max(1, int(settings.reranker_batch_size))
        self._model: CrossEncoder | None = None

    def _ensure_model(self) -> CrossEncoder | None:
        if not self.enabled:
            return None
        if self._model is None:
            try:
                logger.info("[reranker] loading model: %s", self.model_name)
                self._model = CrossEncoder(self.model_name, device=self.device)
            except Exception as exc:
                logger.warning("[reranker] disabled due to load error: %s", exc)
                self.enabled = False
                return None
        return self._model

    def score(self, query: str, docs: list[str]) -> list[float]:
        model = self._ensure_model()
        if model is None or not docs:
            return [0.0 for _ in docs]
        pairs = [(query, d) for d in docs]
        try:
            scores = model.predict(pairs, batch_size=self.batch_size, show_progress_bar=False)
            return [float(s) for s in scores]
        except Exception as exc:
            logger.warning("[reranker] predict failed: %s", exc)
            return [0.0 for _ in docs]


reranker_service = RerankerService()
