from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "admission-rag-chatbot-backend"
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    api_v1_prefix: str = "/api/v1"
    log_level: str = "INFO"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    data_dir: str = "../data"
    qa_dataset_path: str = "./storage/qa_dataset.jsonl"
    chroma_dir: str = "./storage/chroma"
    chroma_collection: str = "admission_chunks"

    openrouter_api_key: str = ""
    openrouter_model: str = "openai/gpt-oss-120b:free"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    top_k: int = 8
    retrieval_candidate_k: int = 100
    embedding_provider: str = "sentence_transformers"
    embedding_model: str = "paraphrase-multilingual-MiniLM-L12-v2"
    embedding_device: str = "auto"
    reranker_enabled: bool = True
    reranker_model: str = "BAAI/bge-reranker-v2-m3"
    reranker_device: str = "cpu"
    reranker_batch_size: int = 8

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()


def get_cors_origins() -> list[str]:
    return [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
