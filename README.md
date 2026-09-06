# Bot de Gastos por WhatsApp — Guía de instalación

Esta guía asume que **nunca has programado**. Vas a crear cuentas gratuitas en 4 servicios y copiar/pegar algunos datos. Tómate tu tiempo, no hay que apurarse.

---

## Resumen de lo que vas a necesitar (todo gratis o casi gratis)

| Servicio | Para qué sirve | Costo |
|---|---|---|
| Meta for Developers | Tu número de WhatsApp "de negocio" | Gratis (1,000 conversaciones/mes) |
| GitHub | Guardar el código para poder desplegarlo | Gratis |
| Render.com | "Encender" el servidor 24/7 | Gratis (con límites) |
| Anthropic (Claude) | La IA que lee fotos y texto | Créditos gratis al inicio |
| OpenAI (Whisper) | Transcribe las notas de voz | Muy barato (~$0.006 por minuto de audio, unos centavos al mes) |
| Airtable | Donde se guardan tus gastos, como una hoja de Excel | Gratis |

> El único paso con un costo real (mínimo) es OpenAI para transcribir audios. Si solo quieres fotos y texto (sin notas de voz) por ahora, puedes saltarte ese paso y dejarlo vacío — el código seguirá funcionando para fotos y texto.

---

## Paso 1: Sube el código a GitHub

1. Crea una cuenta gratis en [github.com](https://github.com).
2. Haz clic en el botón verde **"New"** para crear un repositorio nuevo. Ponle de nombre `whatsapp-gastos-bot` y márcalo como público. Clic en **"Create repository"**.
3. En la página del repositorio, busca el enlace **"uploading an existing file"** y arrastra ahí los archivos: `server.js`, `package.json`, `.env.example` (el archivo `.env` NUNCA lo subas, ese es solo para ti).
4. Confirma la subida ("Commit changes").

## Paso 2: Activa tu número de WhatsApp con Twilio (Sandbox)

Usamos Twilio en vez de conectar directo con Meta porque te deja probar en minutos, sin necesitar un "portafolio comercial" verificado.

1. Crea una cuenta gratis en [twilio.com/try-twilio](https://www.twilio.com/try-twilio).
2. Una vez dentro, en el menú de la izquierda busca **"Messaging" → "Try it out" → "Send a WhatsApp message"** (o busca "WhatsApp Sandbox" en el buscador del panel).
3. Verás un número de Twilio (algo como `+1 415 523 8886`) y un código único, por ejemplo `join palabra-clave`.
4. Desde tu WhatsApp personal, manda un mensaje a ese número con el texto exacto `join palabra-clave` que te dieron. Esto conecta tu número al Sandbox de pruebas (dura unos días, luego hay que reenviarlo si dejas de usarlo).
5. En la misma pantalla, copia estos 3 datos (los vas a necesitar en el Paso 4 de Render):
   - **Account SID** (lo ves en el Dashboard principal de Twilio)
   - **Auth Token** (junto al Account SID, con un botón para mostrarlo)
   - El **número de WhatsApp del Sandbox**, con el formato `whatsapp:+14155238886`

## Paso 3: Crea tu base en Airtable

1. Crea una cuenta gratis en [airtable.com](https://airtable.com).
2. Crea una base nueva llamada "Gastos".
3. En la tabla, crea estas columnas exactamente con estos nombres: `Usuario`, `Monto`, `Categoria`, `Fecha`, `Descripcion`, `Fuente`.
4. Ve a [airtable.com/create/tokens](https://airtable.com/create/tokens), crea un **Personal Access Token** con permisos `data.records:write` y `data.records:read`, y dale acceso a tu base "Gastos". Copia ese token.
5. Copia también el **Base ID**: aparece en la URL cuando abres tu base (empieza con `app...`), o en [airtable.com/api](https://airtable.com/api) seleccionando tu base.

## Paso 4: Consigue tu API key de Anthropic (Claude)

1. Crea una cuenta en [console.anthropic.com](https://console.anthropic.com).
2. Ve a "API Keys" y crea una nueva. Cópiala (solo se muestra una vez).

## Paso 5 (opcional, para notas de voz): API key de OpenAI

1. Crea una cuenta en [platform.openai.com](https://platform.openai.com).
2. Ve a "API Keys", crea una y cópiala.
3. Agrega una tarjeta con un límite bajo de gasto (por ejemplo $5) en la sección de facturación, para evitar sorpresas.

## Paso 6: Despliega el servidor en Render (gratis)

1. Crea una cuenta en [render.com](https://render.com), puedes usar tu cuenta de GitHub para entrar directo.
2. Clic en **"New +"** → **"Web Service"**.
3. Conecta tu repositorio `whatsapp-gastos-bot` de GitHub.
4. En la configuración:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - Plan: **Free**
5. Antes de crear el servicio, ve a la sección **"Environment Variables"** y agrega una por una (con los datos que copiaste en los pasos anteriores):
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_WHATSAPP_NUMBER` → con el formato `whatsapp:+14155238886`
   - `ANTHROPIC_API_KEY`
   - `OPENAI_API_KEY` (si vas a usar audio)
   - `AIRTABLE_API_KEY`
   - `AIRTABLE_BASE_ID`
   - `AIRTABLE_TABLE_NAME` → `Gastos`
6. Clic en **"Create Web Service"**. Espera unos minutos mientras se instala.
7. Cuando termine, Render te da una URL parecida a `https://whatsapp-gastos-bot.onrender.com`. Cópiala.

> Nota: en el plan gratis, Render "duerme" el servidor si no recibe mensajes por 15 minutos, y tarda unos segundos en despertar con el siguiente mensaje. Es normal, no es un error.

## Paso 7: Conecta el webhook en Twilio

1. Regresa al panel de Twilio, a la misma pantalla del "WhatsApp Sandbox" (Messaging → Try it out → Send a WhatsApp message).
2. Busca el campo que dice **"When a message comes in"**.
3. Pega ahí: `https://TU-URL-DE-RENDER.onrender.com/webhook`
4. Asegúrate que el método esté en **HTTP POST**.
5. Guarda los cambios (botón "Save").

## Paso 8: ¡Pruébalo!

1. Desde tu WhatsApp (el mismo que usaste para mandar el `join palabra-clave`), escribe: "Gasté 50 en el súper".
2. En unos segundos deberías recibir la confirmación, y ver la fila nueva en tu tabla de Airtable.
3. Prueba también mandando una foto de un recibo y una nota de voz.

> Nota: en el plan gratis de Twilio, cada persona que quiera probar el bot debe mandar su propio `join palabra-clave` primero (una sola vez) desde su WhatsApp. Cuando pases a producción con un número propio verificado, ya no hará falta ese paso.

---

## Si algo falla

- **No llega respuesta:** revisa los "Logs" de tu servicio en Render — ahí se ve el error exacto.
- **Dice "sandbox expirado" o no responde nada:** el Sandbox de Twilio se desconecta después de unos días de inactividad; vuelve a mandar el `join palabra-clave` desde tu WhatsApp.
- **Airtable no guarda:** revisa que los nombres de las columnas coincidan exactamente (mayúsculas incluidas).

## App Web: ver el análisis de presupuesto

Este mismo servidor incluye ahora una página web donde cualquier persona que use el bot puede entrar a ver sus gastos: total del mes, categoría donde más gasta, una gráfica, y su lista de movimientos.

**Cómo se usa:**
1. Cada persona entra en su navegador (celular o computadora) a tu URL de Render, por ejemplo: `https://whatsapp-gastos-bot.onrender.com`
2. Escribe su número de WhatsApp (el mismo con el que le manda mensajes al bot).
3. Ve su resumen de inmediato — los datos vienen del mismo Airtable donde el bot guarda todo.

**Cómo publicar esta actualización:**
1. En GitHub, sube (o reemplaza) los archivos `server.js` y la nueva carpeta `public/` (con `index.html` adentro) en tu repositorio, igual que hiciste la primera vez.
2. Render detecta el cambio automáticamente y vuelve a desplegar en un par de minutos (lo ves en la pestaña "Events" de tu servicio).
3. Ya no necesitas hacer nada más — la misma URL de siempre ahora también muestra el dashboard.

**Nota sobre privacidad:** por ahora, el único "candado" para ver los datos de alguien es conocer su número de teléfono — no es una contraseña real. Para un grupo cerrado de confianza (familia, equipo pequeño) esto es suficiente para empezar. Si más adelante quieres algo más seguro (login con código enviado por WhatsApp, por ejemplo), lo podemos agregar cuando llegues a esa etapa.

## Siguiente nivel

Cuando quieras salir del Sandbox de pruebas y tener tu propio número de WhatsApp de negocio (sin que la gente tenga que mandar `join...` primero), Twilio te guía para solicitar un número de WhatsApp Business real, lo cual sí requiere verificar tu negocio ante Meta — pero para ese momento ya sabrás que tu idea funciona y vale la pena el papeleo.
