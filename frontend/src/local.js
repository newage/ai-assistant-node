import express from 'express';
import app from './index.js';

const port = Number(process.env.PORT) || 3000;
const local = express();
local.use(express.static('public'));
local.use(app);
local.listen(port, () => console.log(`http://localhost:${port}`));
