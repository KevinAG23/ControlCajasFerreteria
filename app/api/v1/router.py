from fastapi import APIRouter
from .auth import router as auth_router
from .catalogos import router as cat_router
from .audio import router as audio_router
from .atenciones import router as atenciones_router

router = APIRouter(prefix="/api/v1")
router.include_router(auth_router, prefix="/auth", tags=["auth"])
router.include_router(cat_router, tags=["catalogos"])
router.include_router(audio_router, tags=["audio"])
router.include_router(atenciones_router, tags=["atenciones"])