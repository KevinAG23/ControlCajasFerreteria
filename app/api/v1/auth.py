from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.db.models import Usuario
from app.core.security import verify_password, create_access_token

router = APIRouter()

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    q = await db.execute(select(Usuario).where(Usuario.username == payload.username))
    user = q.scalar_one_or_none()

    if not user or not user.activo:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    # IMPORTANTE: si password_hash es "__HASH_CAJERO__", esto fallará.
    try:
        ok = verify_password(payload.password, user.password_hash)
    except Exception:
        ok = False

    if not ok:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    token = create_access_token(sub=user.username)
    return TokenResponse(access_token=token)
