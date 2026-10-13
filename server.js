const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Prevent browser from caching service-worker.js and root index.html indefinitely
app.use((req, res, next) => {
  if (req.path === '/service-worker.js') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  } else if (req.path === '/' || req.path === '/index.html') {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate, max-age=0');
  }
  next();
});

// Serve static assets from applet root
app.use(express.static(path.join(__dirname)));

// Fallback route for SPA / root path
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, must-revalidate, max-age=0');
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Trails of Tukana Helper server running on http://0.0.0.0:${PORT}`);
});
