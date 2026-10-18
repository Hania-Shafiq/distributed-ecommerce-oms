# embeddings.py
# ─────────────────────────────────────────────────────────────────────────────
# Text embeddings using FastEmbed (ONNX runtime, no PyTorch).
# Uses model BAAI/bge-small-en-v1.5 (384 dimensions) with an explicit cache dir.
# Model is loaded lazily once and query embeddings are LRU-cached (maxsize 1000).
# ─────────────────────────────────────────────────────────────────────────────

import os
import functools
import logging
from typing import List, Optional

logger = logging.getLogger("product_service.embeddings")

MODEL_NAME = "BAAI/bge-small-en-v1.5"
CACHE_DIR = os.getenv("FASTEMBED_CACHE_PATH", "/app/model_cache")

_model_instance = None


def get_embedding_model():
    """
    Lazily loads the FastEmbed TextEmbedding singleton instance once.
    Falls back gracefully if initialization fails.
    """
    global _model_instance
    if _model_instance is None:
        try:
            from fastembed import TextEmbedding
            os.environ.setdefault("HF_HUB_OFFLINE", "1")
            logger.info(f"[Embeddings] Lazily initializing model '{MODEL_NAME}' from cache '{CACHE_DIR}'...")
            try:
                _model_instance = TextEmbedding(model_name=MODEL_NAME, cache_dir=CACHE_DIR, local_files_only=True)
            except TypeError:
                _model_instance = TextEmbedding(model_name=MODEL_NAME, cache_dir=CACHE_DIR)
            logger.info(f"[Embeddings] Model '{MODEL_NAME}' initialized successfully.")
        except Exception as exc:
            logger.error(f"[Embeddings] Failed to load embedding model: {exc}")
            return None
    return _model_instance


def compute_batch_embeddings(texts: List[str]) -> List[Optional[List[float]]]:
    """
    Computes 384-dimensional embeddings in a single vectorized batch.
    """
    if not texts:
        return []
    model = get_embedding_model()
    if model is None:
        return [None] * len(texts)
    try:
        embeddings = list(model.embed(texts))
        return [[float(x) for x in emb] for emb in embeddings]
    except Exception as exc:
        logger.error(f"[Embeddings] Batch embedding generation failed: {exc}")
        return [None] * len(texts)


@functools.lru_cache(maxsize=1000)
def _get_query_embedding_tuple(query: str) -> Optional[tuple]:
    """
    Internal LRU-cached query embedding returning a tuple for immutability and hashability.
    """
    model = get_embedding_model()
    if model is None:
        return None
    try:
        results = list(model.embed([query]))
        if results and len(results) > 0:
            return tuple(float(x) for x in results[0])
    except Exception as exc:
        logger.error(f"[Embeddings] Query embedding failed for '{query}': {exc}")
    return None


def get_query_embedding(query: str) -> Optional[List[float]]:
    """
    Returns the 384-dimensional embedding vector for a search query.
    Utilizes an LRU cache (1000 entries) for high performance.
    """
    clean_query = query.strip()
    if not clean_query:
        return None
    cached = _get_query_embedding_tuple(clean_query)
    if cached is not None:
        return list(cached)
    return None


def compute_text_embedding(text: str) -> Optional[List[float]]:
    """
    Computes a 384-dimensional vector embedding for arbitrary product text.
    """
    clean_text = text.strip()
    if not clean_text:
        return None
    model = get_embedding_model()
    if model is None:
        return None
    try:
        results = list(model.embed([clean_text]))
        if results and len(results) > 0:
            return [float(x) for x in results[0]]
    except Exception as exc:
        logger.error(f"[Embeddings] Text embedding generation failed: {exc}")
    return None


def build_product_embedding_text(name: str, category: str, description: Optional[str]) -> str:
    """
    Combines product metadata into text format: text = name + category + description.
    """
    parts = []
    if name and name.strip():
        parts.append(name.strip())
    if category and category.strip():
        parts.append(category.strip())
    if description and description.strip():
        parts.append(description.strip())
    return " ".join(parts)
