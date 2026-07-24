import asyncio
from database import SessionLocal
from models import Usuario, Rol, Contacto
from auth import get_password_hash
from sqlalchemy import select
from datetime import datetime

async def seed_users():
    async with SessionLocal() as db:
        # 1. Get Admin Role
        result = await db.execute(select(Rol).where(Rol.nombre == "Administrador"))
        admin_role = result.scalars().first()
        
        if not admin_role:
            print("Error: 'Administrador' role not found. Run seed_roles.py first.")
            return

        # 2. Check if Admin User exists
        result = await db.execute(select(Usuario).where(Usuario.username == "admin"))
        admin_user = result.scalars().first()

        if not admin_user:
            print("Creating 'admin' user...")
            
            # Create Contact for Admin
            admin_contact = Contacto(
                nombre="Administrador",
                apellido="Sistema",
                telefono="0000000000",
                email="admin@sistema.local",
                direccion="Sistema",
                fecha_creacion=datetime.now()
            )
            db.add(admin_contact)
            await db.flush() # Get ID

            # Create User
            new_user = Usuario(
                contacto_id=admin_contact.id,
                rol_id=admin_role.id,
                username="admin",
                password_hash=get_password_hash("admin123"),
                activo=True,
                fecha_creacion=datetime.now()
            )
            db.add(new_user)
            await db.commit()
            print("Admin user created successfully.")
        else:
            print("Admin user already exists. Updating password...")
            admin_user.password_hash = get_password_hash("admin123")
            await db.commit()
            print("Admin password updated to 'admin123'.")

if __name__ == "__main__":
    asyncio.run(seed_users())
