import asyncio
from backend.database import SessionLocal
from backend.models import CategoriaMetrica, PreguntaMetrica
from sqlalchemy import select

METRICS_DATA = {
    "ATENCIÓN AL CLIENTE": [
        "¿Saludo al recibir al cliente?",
        "¿Preguntó cómo podía ayudar al cliente?",
        "¿Mencionó claramente el precio del producto?",
        "¿Consultó al cliente sobre el uso del producto para asegurar que eligiera la opción correcta?",
        "¿Explicó al cliente que la entrega no podía hacerse el mismo día? “En caso de ser necesario”",
        "¿Informó si el producto estaba disponible en ese momento? “En caso de ser necesario”",
        "¿Consultó si el cliente necesitaba algo más?",
        "¿Verificó con el cliente que el producto facturado era realmente el que deseaba llevar?",
        "¿Confirmó con el cliente la cantidad de productos antes de cerrar la venta?",
        "¿Confirmó con el cliente que sus datos (nombre, dirección o contacto) estaban correctos?",
        "¿Preguntó al cliente si la factura iba con datos o como consumidor final?",
        "¿Aclaró cuándo es posible devolver un producto? “En caso de ser necesario”",
        "¿Le informó al cliente que el retiro del producto o coordinación de las entregas deben ser en bodega? “ En caso de ser necesario”",
        "¿Se despidió del cliente al finalizar la compra?"
    ],
    "VENTAS Y SUGERENCIAS": [
        "¿Sugirió un producto adicional que complementa lo solicitado?",
        "¿Ofreció un producto de mejor calidad o rendimiento como alternativa?",
        "¿Ofreció alternativas cuando el producto solicitado no estaba disponible?"
    ],
    "MARKETING": [
        "¿Mencionó promociones vigentes?",
        "¿Informó sobre nuevos productos?",
        "¿Promovió alguna acción para que el cliente regrese?"
    ]
}

async def seed_metrics():
    async with SessionLocal() as db:
        print("Starting metrics seed...")
        
        for cat_name, questions in METRICS_DATA.items():
            # Check if category exists
            result = await db.execute(select(CategoriaMetrica).where(CategoriaMetrica.nombre == cat_name))
            category = result.scalars().first()
            
            if not category:
                print(f"Creating category: {cat_name}")
                category = CategoriaMetrica(nombre=cat_name, descripcion=f"Preguntas relacionadas con {cat_name.lower()}")
                db.add(category)
                await db.flush() # Get ID
            else:
                print(f"Category exists: {cat_name}")
            
            # Add questions
            for q_text in questions:
                # Check if question exists in this category
                q_result = await db.execute(select(PreguntaMetrica).where(
                    PreguntaMetrica.categoria_id == category.id,
                    PreguntaMetrica.texto == q_text
                ))
                question = q_result.scalars().first()
                
                if not question:
                    print(f"  Adding question: {q_text[:50]}...")
                    question = PreguntaMetrica(categoria_id=category.id, texto=q_text)
                    db.add(question)
                else:
                    print(f"  Question exists: {q_text[:30]}...")
        
        await db.commit()
        print("Metrics seeding completed successfully!")

if __name__ == "__main__":
    asyncio.run(seed_metrics())
