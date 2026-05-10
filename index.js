diff --git a/index.js b/index.js
index 801692060a3bf5650cca0660ff16f34bb1a5dcdc..2c3f9e779f15a8eafdc329c156732c15951f401c 100644
--- a/index.js
+++ b/index.js
@@ -30,59 +30,81 @@ try {
   console.log('✅ [DEP] @napi-rs/canvas a été réinstallé avec succès.');
 }
 
 const configSystem = require('./Systems/configsystem');
 const MaintenanceSystem = require('./Systems/maintenance');
 const LiveSystem = require('./Systems/livesystem');
 const LogSystem = require('./Systems/logsystem');
 const EntranceSystem = require('./Systems/entrancesystem');
 const VerificationSystem = require('./Systems/verificationsystem');
 const XPSystem = require('./Systems/xpsystem');
 const AntiRaidSystem = require('./Systems/antiraid');
 const AntiSpamSystem = require('./Systems/antispam');
 const DmLockSystem = require('./Systems/dmlock');
 const AISystem = require('./Systems/aisystem');
 
 const { commands, deployCommands } = require('./deploy-commands');
 
 require('dotenv').config();
 
 console.log('🚀 Lancement du bot en cours...');
 
 // Serveur de maintien en vie pour Replit (24/7)
 const server = http.createServer((req, res) => {
   // Route pour servir les images (assets)
   if (req.url.startsWith('/assets/')) {
-    const urlPath = req.url.split('?')[0]; // On retire le paramètre de version ?v=...
-    const filePath = path.join(__dirname, 'Data', urlPath.substring(1));
+    const urlPath = decodeURIComponent(req.url.split('?')[0]); // On retire le paramètre de version ?v=...
+    const filePath = path.normalize(path.join(__dirname, 'Data', urlPath.substring(1)));
+    const assetsRoot = path.join(__dirname, 'Data', 'assets');
+
+    const relativeAssetPath = path.relative(assetsRoot, filePath);
+    if (relativeAssetPath.startsWith('..') || path.isAbsolute(relativeAssetPath)) {
+      res.writeHead(403, { 'Content-Type': 'text/plain' });
+      return res.end('Forbidden');
+    }
     
-    if (fs.existsSync(filePath)) {
+    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
+      const fileBuffer = fs.readFileSync(filePath);
       const ext = path.extname(filePath).toLowerCase();
-      const contentType = ext === '.png' ? 'image/png' : (ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/octet-stream');
-      console.log(`🖼️ [HTTP] Service de l'image : ${urlPath}`);
-      res.writeHead(200, { 'Content-Type': contentType });
-      return res.end(fs.readFileSync(filePath));
+      let contentType = 'application/octet-stream';
+
+      if (ext === '.png' || fileBuffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) {
+        contentType = 'image/png';
+      } else if (['.jpg', '.jpeg'].includes(ext) || (fileBuffer[0] === 0xFF && fileBuffer[1] === 0xD8 && fileBuffer[2] === 0xFF)) {
+        contentType = 'image/jpeg';
+      } else if (ext === '.gif' || fileBuffer.subarray(0, 3).toString() === 'GIF') {
+        contentType = 'image/gif';
+      } else if (ext === '.webp' || fileBuffer.subarray(8, 12).toString() === 'WEBP') {
+        contentType = 'image/webp';
+      }
+
+      console.log(`🖼️ [HTTP] Service de l'image : ${urlPath} (${contentType})`);
+      res.writeHead(200, {
+        'Content-Type': contentType,
+        'Cache-Control': 'public, max-age=31536000, immutable'
+      });
+      return res.end(fileBuffer);
     } else {
       console.warn(`⚠️ [HTTP] Image non trouvée : ${filePath}`);
     }
   }
 
   res.writeHead(200, { 'Content-Type': 'text/plain' });
   // Petit log pour confirmer le ping d'UptimeRobot dans la console
   console.log(`📶 Ping reçu d'UptimeRobot à ${new Date().toLocaleTimeString()}`);
   const uptime = Math.floor(process.uptime());
   console.log(`DEBUG: REPL_SLUG = ${process.env.REPL_SLUG}`);
   console.log(`DEBUG: REPL_OWNER = ${process.env.REPL_OWNER}`);
   const minutes = Math.floor(uptime / 60);
   const hours = Math.floor(minutes / 60);
   
   res.write(`U-Bot System
 -------------------
 Statut : Connecte (OK)
 Sync : Bot synchronise
 Uptime : ${hours}h ${minutes % 60}m ${uptime % 60}s`);
   res.end();
 });
 
 server.listen(8080, () => {
   console.log('🌐 Serveur HTTP prêt sur le port 8080');
 }).on('error', (err) => {
