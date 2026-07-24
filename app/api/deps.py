from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.db.models import Usuario
from app.core.security import decode_token

bearer = HTTPBearer(auto_error=True)

async def get_current_user(
    cred: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> Usuario:
    token = cred.credentials
    try:
        payload = decode_token(token)
        sub = payload.get("sub")
        if not sub:
            raise ValueError("Token sin sub")
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido")

    q = await db.execute(select(Usuario).where(Usuario.username == sub))
    user = q.scalar_one_or_none()
    if not user or not user.activo:
        raise HTTPException(status_code=401, detail="Usuario no válido")

    return user
