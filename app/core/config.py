from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    app_name: str = "Caja API"

    # DB
    database_url: str

    # JWT
    jwt_secret: str
    jwt_alg: str = "HS256"
    jwt_expire_min: int = 720

    # Storage
    storage_root: str = "storage"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
