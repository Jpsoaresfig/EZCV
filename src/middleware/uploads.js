'use strict';

/* Uploads.
 *
 * Os ficheiros passam a ir para o Supabase Storage, por isso o multer usa
 * memoryStorage: o conteúdo fica em memória apenas o tempo de ser validado e
 * enviado. O limite de tamanho é imposto pelo multer antes de o buffer
 * crescer, e outra vez pelo próprio bucket (migration 0003).
 *
 * Validação em três camadas, em todos os uploads (§5):
 *   1. extensão do nome original;
 *   2. MIME declarado pelo browser;
 *   3. magic bytes do conteúdo real.
 *
 * A camada 3 é a única em que se pode confiar — as outras duas vêm do
 * cliente (§26).
 */

const multer = require('multer');

const config = require('../config');

const IMAGE_EXT_OK = ['.png', '.jpg', '.jpeg', '.webp'];

const IMAGE_MIME_OK = {
  'image/png': true,
  'image/jpeg': true,
  'image/webp': true
};

/* ------------------------------------------------------------------ *
 * Magic bytes
 * ------------------------------------------------------------------ */

/* Devolve o tipo real da imagem ou null. */
function sniffImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

/* Um PDF a sério começa por %PDF-. */
function isPdf(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 5) return false;
  return buffer.toString('latin1', 0, 5) === '%PDF-';
}

/* ------------------------------------------------------------------ *
 * CV (PDF, um só ficheiro)
 * ------------------------------------------------------------------ */

const cvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    const okExt = name.endsWith('.pdf');
    const okMime = mime === 'application/pdf' || mime === 'application/x-pdf';

    /* Basta um dos dois: no Android, ficheiros vindos do Drive ou do WhatsApp
     * chegam muitas vezes sem «.pdf» no nome ou como octet-stream. A
     * verificação que conta é a do conteúdo (isPdf, %PDF-), feita na rota. */
    if (!okExt && !okMime) {
      const err = new Error('INVALID_TYPE');
      err.code = 'INVALID_TYPE';
      return cb(err);
    }
    cb(null, true);
  }
});

/* Nunca falha o pedido: traduz o erro para req.uploadError e deixa a rota
 * decidir a mensagem, para o candidato receber o formulário de volta com o
 * erro no campo certo em vez de uma página de erro. */
function uploadCvFile(req, res, next) {
  cvUpload.single('cv')(req, res, (err) => {
    if (err) {
      req.uploadError = err.code === 'LIMIT_FILE_SIZE' ? 'TAMAÑO' : 'TIPO';
      req.file = undefined;
    }
    next();
  });
}

/* ------------------------------------------------------------------ *
 * Logo e foto do estabelecimento
 * ------------------------------------------------------------------ */

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxImageBytes, files: 2 },
  fileFilter: (req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    const okExt = IMAGE_EXT_OK.some((e) => name.endsWith(e));
    const okMime = Boolean(IMAGE_MIME_OK[mime]);

    if (!okExt || !okMime) {
      const err = new Error('INVALID_IMAGE_TYPE');
      err.code = 'INVALID_IMAGE_TYPE';
      return cb(err);
    }
    cb(null, true);
  }
});

/* Processa multipart com os campos `logo` e `foto`.
 *
 * Em caso de erro define req.uploadError:
 *   TAMAÑO_IMAGEN    — excede MAX_IMAGE_MB
 *   TIPO_IMAGEN      — extensão ou MIME não aceites
 *   IMAGEN_INVALIDA  — magic bytes não correspondem a PNG/JPG/WEBP
 *
 * Quando passa, anexa req.imageFiles = { logo: {buffer, mime}, foto: {...} }.
 */
function uploadRestaurantImages(req, res, next) {
  if (!req.is('multipart/form-data')) return next();

  imageUpload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'foto', maxCount: 1 }
  ])(req, res, (err) => {
    if (err) {
      req.uploadError = err.code === 'LIMIT_FILE_SIZE' ? 'TAMAÑO_IMAGEN' : 'TIPO_IMAGEN';
      req.files = {};
      return next();
    }

    const out = {};
    for (const kind of ['logo', 'foto']) {
      const file = req.files && req.files[kind] && req.files[kind][0];
      if (!file) continue;

      const mime = sniffImage(file.buffer);
      if (!mime) {
        req.uploadError = 'IMAGEN_INVALIDA';
        req.files = {};
        return next();
      }
      out[kind] = { buffer: file.buffer, mime, size: file.size };
    }

    req.imageFiles = out;
    next();
  });
}

module.exports = {
  uploadCvFile,
  uploadRestaurantImages,
  sniffImage,
  isPdf
};
