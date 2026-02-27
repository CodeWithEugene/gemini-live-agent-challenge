from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    google_cloud_project: str
    google_cloud_location: str = "us-central1"
    gcs_bucket_name: str
    google_application_credentials: str = ""
    gemini_live_model: str = "gemini-2.0-flash-live-001"
    gemini_flash_model: str = "gemini-2.0-flash-001"
    imagen_model: str = "imagen-3.0-generate-002"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
