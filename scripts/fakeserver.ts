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
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
