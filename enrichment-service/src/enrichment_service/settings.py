from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Supabase (service role — jamais exposé au client)
    supabase_url: str
    supabase_service_role_key: str

    # Providers de recherche (mêmes clés que le pipeline Node existant)
    exa_api_key: str = ""
    brave_api_key: str = ""

    # LLM open source gratuit — Groq sert Llama 3.3 70B (open-weights)
    groq_api_key: str = ""
    groq_model: str = "groq/llama-3.3-70b-versatile"

    # Secret partagé avec le proxy Vercel api/enrich-crew.ts
    enrich_service_secret: str

    class Config:
        env_file = ".env"


settings = Settings()
