# 📤 Fichiers à synchroniser avec Replit

## 🔄 Fichiers MODIFIÉS (à uploader en priorité)

### Fichiers principaux :
- `index.js` - Code principal du bot (maintenance supprimée)
- `deploy-commands.js` - Commandes slash (maintenance supprimée)
- `Systems/configsystem.js` - Gestion des boutons (maintenance supprimée)

### Fichiers de configuration :
- `package.json` - Dépendances
- `package-lock.json` - Verrouillage des versions

## 📁 Structure complète à maintenir :

```
📦 Bot Discord
├── 📄 index.js (MODIFIÉ)
├── 📄 deploy-commands.js (MODIFIÉ)
├── 📄 package.json
├── 📄 package-lock.json
├── 📁 commands/
├── 📁 Systems/
│   ├── 📄 configsystem.js (MODIFIÉ)
│   ├── 📄 logs.js
│   ├── 📄 maintenance.js (conservé)
│   ├── 📄 panels.js
│   ├── 📄 tickets.js
│   └── 📄 configsystem.js
├── 📁 config/
├── 📁 Data/
└── 📁 Infos/
```

## 🚀 Instructions de synchronisation :

1. **Allez sur Replit**
2. **Remplacez les fichiers** un par un :
   - Cliquez sur un fichier → "Upload file" → Sélectionnez le fichier local
3. **Après upload** :
   ```bash
   npm install
   node deploy-commands.js
   npm start
   ```

## ⚠️ Points importants :
- **Ne uploadez PAS** `.env` (configurez le token dans Secrets)
- **Ne uploadez PAS** `node_modules/` (faites `npm install`)
- **Redéployez les commandes** après upload

---
*Généré automatiquement - Dernière modification: 24 avril 2026*