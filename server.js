// ============================================================
// BOT DE GASTOS POR WHATSAPP (usando Twilio)
// ------------------------------------------------------------
// Recibe fotos de recibos, notas de voz o mensajes de texto
// por WhatsApp a través de Twilio, usa IA para extraer los
// datos del gasto (monto, fecha, categoría, descripción) y
// los guarda en Airtable. Luego responde al usuario confirmando.
// ============================================================

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // Twilio manda los datos así
app.use(express.static('public')); // sirve la app web (carpeta /public)

const {
  PORT = 3000,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_WHATSAPP_NUMBER, // ej. "whatsapp:+14155238886" (el número del Sandbox)
  ANTHROPIC_API_KEY,
  OPENAI_API_KEY,
  AIRTABLE_API_KEY,
  AIRTABLE_BASE_ID,
  AIRTABLE_TABLE_NAME,
} = process.env;

// ------------------------------------------------------------
// 1) RECEPCIÓN DE MENSAJES DESDE TWILIO
// ------------------------------------------------------------
app.post('/webhook', async (req, res) => {
  // Respondemos de inmediato con un TwiML vacío. La respuesta real
  // al usuario se manda unos segundos después, cuando la IA termine.
  res.set('Content-Type', 'text/xml');
  res.send('<Response></Response>');

  try {
    const from = req.body.From; // ej. "whatsapp:+50212345678"
    const numMedia = parseInt(req.body.NumMedia || '0', 10);

    let resultado;

    if (numMedia > 0) {
      const mediaUrl = req.body.MediaUrl0;
      const contentType = req.body.MediaContentType0 || '';

      if (contentType.startsWith('image/')) {
        resultado = await procesarImagen(mediaUrl, contentType);
      } else if (contentType.startsWith('audio/')) {
        resultado = await procesarAudio(mediaUrl);
      } else {
        await enviarMensajeWhatsApp(
          from,
          'Por ahora solo puedo leer fotos de recibos y notas de voz. 🙂'
        );
        return;
      }
    } else if (req.body.Body) {
      resultado = await procesarTexto(req.body.Body);
    } else {
      return;
    }

    if (!resultado || resultado.error) {
      await enviarMensajeWhatsApp(
        from,
        'No pude entender ese gasto claramente. ¿Puedes intentarlo de nuevo con más detalle? Por ejemplo: "Gasté 50 en el súper" o una foto clara del recibo.'
      );
      return;
    }

    const telefono = from.replace('whatsapp:', '');
    await guardarEnAirtable({ ...resultado, usuario: telefono, fuente: numMedia > 0 ? 'media' : 'texto' });

    await enviarMensajeWhatsApp(
      from,
      `✅ Gasto registrado:\n💰 Monto: ${resultado.monto}\n🏷️ Categoría: ${resultado.categoria}\n📅 Fecha: ${resultado.fecha}\n📝 ${resultado.descripcion}`
    );
  } catch (err) {
    console.error('Error procesando mensaje:', err?.response?.data || err.message);
  }
});

// ------------------------------------------------------------
// 2) DESCARGAR MEDIA (foto o audio) DESDE TWILIO
//    Los archivos de Twilio requieren autenticación básica con
//    tu Account SID y Auth Token.
// ------------------------------------------------------------
async function descargarMedia(url) {
  const resp = await axios.get(url, {
    auth: { username: TWILIO_ACCOUNT_SID, password: TWILIO_AUTH_TOKEN },
    responseType: 'arraybuffer',
  });
  return Buffer.from(resp.data);
}

// ------------------------------------------------------------
// 3) PROCESAR FOTO DE RECIBO (usa Claude con visión)
// ------------------------------------------------------------
async function procesarImagen(mediaUrl, mimeType) {
  const buffer = await descargarMedia(mediaUrl);
  const base64 = buffer.toString('base64');

  const prompt = `Eres un asistente que lee recibos o fotos de compras. Analiza la imagen y devuelve SOLO un JSON (sin texto adicional, sin markdown) con este formato exacto:
{"monto": numero, "categoria": "texto corto", "fecha": "YYYY-MM-DD", "descripcion": "texto corto"}
Si no puedes identificar un gasto en la imagen, devuelve {"error": true}.
Si el recibo no muestra fecha, usa la fecha de hoy.`;

  const resp = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    },
    {
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
    }
  );

  return extraerJSON(resp.data.content?.[0]?.text);
}

// ------------------------------------------------------------
// 4) PROCESAR NOTA DE VOZ (transcribe con Whisper y luego
//    interpreta el texto con Claude)
// ------------------------------------------------------------
async function procesarAudio(mediaUrl) {
  const buffer = await descargarMedia(mediaUrl);

  const form = new FormData();
  form.append('file', buffer, { filename: 'audio.ogg' });
  form.append('model', 'whisper-1');

  const whisperResp = await axios.post(
    'https://api.openai.com/v1/audio/transcriptions',
    form,
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        ...form.getHeaders(),
      },
    }
  );

  const textoTranscrito = whisperResp.data.text;
  return procesarTexto(textoTranscrito);
}

// ------------------------------------------------------------
// 5) PROCESAR TEXTO LIBRE (usa Claude para extraer los datos)
// ------------------------------------------------------------
async function procesarTexto(texto) {
  const prompt = `Extrae los datos de un gasto a partir de este mensaje: "${texto}"
Devuelve SOLO un JSON (sin texto adicional, sin markdown) con este formato exacto:
{"monto": numero, "categoria": "texto corto", "fecha": "YYYY-MM-DD", "descripcion": "texto corto"}
Si no hay fecha mencionada, usa la fecha de hoy (${new Date().toISOString().slice(0, 10)}).
Si el mensaje no describe un gasto, devuelve {"error": true}.`;

  const resp = await axios.post(
    'https://api.anthropic.com/v1/messages',
    {
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    },
    {
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
    }
  );

  return extraerJSON(resp.data.content?.[0]?.text);
}

// ------------------------------------------------------------
// 6) GUARDAR EL GASTO EN AIRTABLE
// ------------------------------------------------------------
async function guardarEnAirtable(datos) {
  await axios.post(
    `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`,
    {
      fields: {
        Usuario: datos.usuario,
        Monto: datos.monto,
        Categoria: datos.categoria,
        Fecha: datos.fecha,
        Descripcion: datos.descripcion,
        Fuente: datos.fuente,
      },
    },
    { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } }
  );
}

// ------------------------------------------------------------
// 7) ENVIAR MENSAJE DE RESPUESTA AL USUARIO (vía API de Twilio)
// ------------------------------------------------------------
async function enviarMensajeWhatsApp(to, body) {
  const params = new URLSearchParams();
  params.append('From', TWILIO_WHATSAPP_NUMBER);
  params.append('To', to);
  params.append('Body', body);

  await axios.post(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    params,
    { auth: { username: TWILIO_ACCOUNT_SID, password: TWILIO_AUTH_TOKEN } }
  );
}

// ------------------------------------------------------------
// 8) API PARA LA APP WEB: devuelve los gastos de un usuario
// ------------------------------------------------------------
app.get('/api/gastos', async (req, res) => {
  const telefono = (req.query.telefono || '').replace(/\D/g, ''); // solo dígitos
  if (!telefono) return res.status(400).json({ error: 'Falta el número de teléfono' });

  try {
    const resp = await axios.get(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`,
      {
        headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
        params: {
          filterByFormula: `{Usuario}='${telefono}'`,
          sort: [{ field: 'Fecha', direction: 'desc' }],
          pageSize: 100,
        },
      }
    );

    const gastos = resp.data.records.map((r) => ({
      monto: Number(r.fields.Monto) || 0,
      categoria: r.fields.Categoria || 'Sin categoría',
      fecha: r.fields.Fecha || '',
      descripcion: r.fields.Descripcion || '',
      fuente: r.fields.Fuente || '',
    }));

    res.json({ gastos });
  } catch (err) {
    console.error('Error consultando Airtable:', err?.response?.data || err.message);
    res.status(500).json({ error: 'No se pudo consultar los gastos' });
  }
});

// ------------------------------------------------------------
// Utilidad: limpia y parsea el JSON que devuelve el modelo
// ------------------------------------------------------------
function extraerJSON(texto) {
  if (!texto) return { error: true };
  try {
    const limpio = texto.replace(/```json|```/g, '').trim();
    return JSON.parse(limpio);
  } catch {
    return { error: true };
  }
}

app.listen(PORT, () => console.log(`Servidor escuchando en el puerto ${PORT}`));
