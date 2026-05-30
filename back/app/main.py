from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import run_migrations
from app.interfaces.http.routers import auth, business_flows, graphs
from app.routers import health


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        run_migrations()
    except Exception as exc:
        print(f"[warn] migration skipped or failed: {exc}")
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="antvX6 ER API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router, prefix=settings.api_prefix)
    app.include_router(auth.router, prefix=settings.api_prefix)
    app.include_router(graphs.router, prefix=settings.api_prefix)
    app.include_router(business_flows.router, prefix=settings.api_prefix)
    return app


app = create_app()
