import os

# Settings factices — les tests ne touchent ni Supabase ni les APIs réelles
os.environ.setdefault("SUPABASE_URL", "http://supabase.test")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")
os.environ.setdefault("EXA_API_KEY", "test-exa")
os.environ.setdefault("BRAVE_API_KEY", "test-brave")
os.environ.setdefault("GROQ_API_KEY", "test-groq")
os.environ.setdefault("ENRICH_SERVICE_SECRET", "test-secret")
