const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sharp = require('sharp');
const PDFDocument = require('pdfkit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// Set up Multer with a 5MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5 MB limit
  }
}).single('file');

const getSafeFilename = (originalName, targetFormat) => {
  const ext = path.extname(originalName);
  const baseName = path.basename(originalName, ext);
  const safeBase = baseName.replace(/[^a-zA-Z0-9-_]/g, '_');
  return `${safeBase}_converted.${targetFormat}`;
};

// --- In-Memory CSV/JSON Converters ---
const convertCsvToJson = (csvBuffer) => {
  const csvText = csvBuffer.toString('utf-8');
  const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length === 0) return '[]';
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
  const result = [];
  
  for (let i = 1; i < lines.length; i++) {
    const obj = {};
    const currentLine = lines[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
    headers.forEach((header, index) => {
      obj[header] = currentLine[index] !== undefined ? currentLine[index] : '';
    });
    result.push(obj);
  }
  return JSON.stringify(result, null, 2);
};

const convertJsonToCsv = (jsonBuffer) => {
  const jsonText = jsonBuffer.toString('utf-8');
  const data = JSON.parse(jsonText);
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('JSON must be a non-empty array of objects for CSV conversion.');
  }
  
  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];
  
  for (const row of data) {
    const values = headers.map(header => {
      const val = row[header] !== undefined && row[header] !== null ? row[header] : '';
      const escaped = ('' + val).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(','));
  }
  return csvRows.join('\n');
};

// --- In-Memory Text/HTML/Markdown Converters ---
const convertTextToHtml = (textBuffer, title = 'Converted Document') => {
  const text = textBuffer.toString('utf-8');
  const escapedText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  
  const formattedText = escapedText.split(/\r?\n/).map(line => {
    if (line.trim() === '') return '<p>&nbsp;</p>';
    return `<p>${line}</p>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 40px auto; padding: 0 20px; }
    p { margin-bottom: 1em; }
  </style>
</head>
<body>
  ${formattedText}
</body>
</html>`;
};

const convertHtmlToText = (htmlBuffer) => {
  const html = htmlBuffer.toString('utf-8');
  return html
    .replace(/<style([\s\S]*?)<\/style>/gi, '')
    .replace(/<script([\s\S]*?)<\/script>/gi, '')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim();
};

// --- In-Memory PDF Generators ---
const convertImageToPdf = (imageBuffer) => {
  return new Promise(async (resolve, reject) => {
    try {
      // transcode to PNG first using Sharp for perfect PDFKit compatibility
      const pngBuffer = await sharp(imageBuffer).png().toBuffer();
      const metadata = await sharp(pngBuffer).metadata();
      
      const doc = new PDFDocument({ autoFirstPage: false });
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', err => reject(err));
      
      // Points scale: convert image pixels (e.g. 96dpi) to points (72dpi)
      const width = metadata.width * 72 / 96;
      const height = metadata.height * 72 / 96;
      
      doc.addPage({ size: [width, height] });
      doc.image(pngBuffer, 0, 0, { width, height });
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

const convertTextToPdf = (textBuffer, filename) => {
  return new Promise((resolve, reject) => {
    try {
      const ext = path.extname(filename).toLowerCase();
      let text = textBuffer.toString('utf-8');
      
      if (ext === '.html') {
        text = convertHtmlToText(textBuffer);
      }
      
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', err => reject(err));
      
      doc.fontSize(16).fillColor('#1e1b4b').text(filename, { underline: true });
      doc.moveDown(1.5);
      doc.fontSize(10).fillColor('#334155').text(text, { align: 'justify', lineGap: 4 });
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

// --- Main Conversion Route ---
app.post('/api/convert', (req, res) => {
  upload(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, error: 'File size exceeds the 5MB limit.' });
      }
      return res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(500).json({ success: false, error: `Internal server upload error: ${err.message}` });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded.' });
    }

    const { targetFormat } = req.body;
    if (!targetFormat) {
      return res.status(400).json({ success: false, error: 'Target format is required.' });
    }

    const fileBuffer = req.file.buffer;
    const originalName = req.file.originalname;
    const originalExt = path.extname(originalName).toLowerCase().substring(1);
    const lowercaseTarget = targetFormat.toLowerCase();

    if (originalExt === lowercaseTarget) {
      return res.status(400).json({ success: false, error: `The file is already in ${targetFormat.toUpperCase()} format!` });
    }

    try {
      let convertedBuffer;
      let contentType = 'application/octet-stream';
      const outputFilename = getSafeFilename(originalName, lowercaseTarget);

      const imageExtensions = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'tiff', 'avif'];
      const docExtensions = ['txt', 'md', 'html'];

      // --- PDF Conversion Pipeline ---
      if (lowercaseTarget === 'pdf') {
        if (imageExtensions.includes(originalExt)) {
          convertedBuffer = await convertImageToPdf(fileBuffer);
          contentType = 'application/pdf';
        } else if (docExtensions.includes(originalExt)) {
          convertedBuffer = await convertTextToPdf(fileBuffer, originalName);
          contentType = 'application/pdf';
        } else {
          return res.status(400).json({
            success: false,
            error: `PDF conversion is not supported for .${originalExt.toUpperCase()} files.`
          });
        }
      }

      // --- Image-to-Image Conversions (Sharp) ---
      else if (imageExtensions.includes(lowercaseTarget)) {
        let sharpInstance;
        try {
          sharpInstance = sharp(fileBuffer);
          await sharpInstance.metadata();
        } catch (e) {
          return res.status(400).json({ success: false, error: 'Input file is not a valid image.' });
        }

        if (lowercaseTarget === 'jpg' || lowercaseTarget === 'jpeg') {
          convertedBuffer = await sharpInstance.jpeg({ quality: 90 }).toBuffer();
          contentType = 'image/jpeg';
        } else if (lowercaseTarget === 'png') {
          convertedBuffer = await sharpInstance.png().toBuffer();
          contentType = 'image/png';
        } else if (lowercaseTarget === 'webp') {
          convertedBuffer = await sharpInstance.webp({ quality: 85 }).toBuffer();
          contentType = 'image/webp';
        } else if (lowercaseTarget === 'gif') {
          convertedBuffer = await sharpInstance.gif().toBuffer();
          contentType = 'image/gif';
        } else if (lowercaseTarget === 'tiff') {
          convertedBuffer = await sharpInstance.tiff().toBuffer();
          contentType = 'image/tiff';
        } else if (lowercaseTarget === 'avif') {
          convertedBuffer = await sharpInstance.avif({ quality: 80 }).toBuffer();
          contentType = 'image/avif';
        }
      }

      // --- Data Conversions (CSV <-> JSON) ---
      else if (lowercaseTarget === 'json' && originalExt === 'csv') {
        const jsonString = convertCsvToJson(fileBuffer);
        convertedBuffer = Buffer.from(jsonString, 'utf-8');
        contentType = 'application/json';
      }
      else if (lowercaseTarget === 'csv' && originalExt === 'json') {
        const csvString = convertJsonToCsv(fileBuffer);
        convertedBuffer = Buffer.from(csvString, 'utf-8');
        contentType = 'text/csv';
      }

      // --- Document Conversions (TXT <-> HTML) ---
      else if (lowercaseTarget === 'html' && (originalExt === 'txt' || originalExt === 'md')) {
        const htmlString = convertTextToHtml(fileBuffer, originalName);
        convertedBuffer = Buffer.from(htmlString, 'utf-8');
        contentType = 'text/html';
      }
      else if (lowercaseTarget === 'txt' && originalExt === 'html') {
        const textString = convertHtmlToText(fileBuffer);
        convertedBuffer = Buffer.from(textString, 'utf-8');
        contentType = 'text/plain';
      }

      // Unsupported conversions
      else {
        return res.status(400).json({
          success: false,
          error: `Conversion from ${originalExt.toUpperCase()} to ${lowercaseTarget.toUpperCase()} is not supported.`
        });
      }

      const convertedSize = convertedBuffer.length;
      const base64Data = convertedBuffer.toString('base64');

      return res.status(200).json({
        success: true,
        filename: outputFilename,
        contentType: contentType,
        originalSize: req.file.size,
        convertedSize: convertedSize,
        fileData: `data:${contentType};base64,${base64Data}`
      });

    } catch (conversionError) {
      console.error('Conversion Error:', conversionError);
      return res.status(500).json({ success: false, error: `Failed to convert file: ${conversionError.message}` });
    }
  });
});

app.get('/api/status', (req, res) => {
  res.json({ status: 'active', limit: '5MB', pdfSupport: true });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
