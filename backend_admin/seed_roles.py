import asyncio
from database import SessionLocal, engine
from models import Rol
from sqlalchemy import select

async def seed_roles():
    async with SessionLocal() as db:
        roles = ["Administrador", "Cajero"]
        for role_name in roles:
            result = await db.execute(select(Rol).where(Rol.nombre == role_name))
            role = result.scalars().first()
            if not role:
                print(f"Creating role: {role_name}")
                new_role = Rol(nombre=role_name, descripcion=f"Rol de {role_name}")
                db.add(new_role)
            else:
                print(f"Role already exists: {role_name}")
        await db.commit()

if __name__ == "__main__":
    asyncio.run(seed_roles())
