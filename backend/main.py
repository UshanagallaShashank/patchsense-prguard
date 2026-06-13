import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import webhook, health, reviews, repos

app = FastAPI(title="PatchSense PR Guard", version="0.1.0")

# CORS_ORIGINS: comma-separated list of allowed frontend origins.
# Defaults to localhost dev server; set in production env.
_raw = os.environ.get("CORS_ORIGINS", "http://localhost:5173")
_origins = [o.strip() for o in _raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-GitHub-Token"],
)

app.include_router(health.router)
app.include_router(webhook.router)
app.include_router(reviews.router)
app.include_router(repos.router)
