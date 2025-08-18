import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';

const app = express();
const PORT = 3000;

/* eslint-disable no-underscore-dangle */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (_, res) => {
    res.json('hello world');
});

// Dynamic route handler for folder-based routing
app.get(/^\/([^/]+)\/.*$/, (req, res) => {
    const folder = req.params[0];
    const { f } = req.query;

    const folderPath = path.join(__dirname, 'public', folder);

    if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
        return res.status(404).send('Folder not found');
    }

    let pageFile: string;

    if (f && typeof f === 'string') {
        const pageNumber = parseInt(f, 10);
        if (Number.isNaN(pageNumber) || pageNumber < 1) {
            return res.status(400).send('Invalid page number');
        }
        pageFile = `page${pageNumber}.html`;
    } else {
        pageFile = 'page1.html';
    }

    const filePath = path.join(folderPath, pageFile);

    if (!fs.existsSync(filePath)) {
        return res.status(404).send(`Page file ${pageFile} not found in ${folder} folder`);
    }

    return res.sendFile(filePath);
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
