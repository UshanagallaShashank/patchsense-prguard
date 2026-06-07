from fastapi import FastAPI

from app.api.routes import webhook, health

# Creates the FastAPI application instance
app = FastAPI(title="PatchSense PR Guard", version="0.1.0")

app.include_router(health.router)
app.include_router(webhook.router)
