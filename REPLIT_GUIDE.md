# 🚀 Guide de Déploiement sur Replit

## 📋 Étapes à suivre

### **1. Créer un compte Replit**
- Allez sur [replit.com](https://replit.com)
- Inscrivez-vous avec Google, GitHub ou email

### **2. Créer un nouveau Replit**
- Cliquez sur **"Create Replit"**
- Choisissez **"Import from GitHub"** ou **"Upload files"**
- Si vous uploadez : créez un dossier et téléchargez tous vos fichiers

### **3. Fichiers à uploader**
```
✅ Tous les fichiers de votre projet :
- index.js
- deploy-commands.js
- package.json
- .env (créé automatiquement)
- .replit (créé automatiquement)
- commands/
- Systems/
- config/
- Data/
```

### **4. Configuration du token**
- ⚠️ **NE PARTEZ PAS** le `.env` avec le token en public !
- Sur Replit, allez dans **"Secrets"** (🔑 en bas à gauche)
- Ajoutez : `DISCORD_TOKEN` = `votre_token`
- Le `.env` sera auto-rempli

### **5. Installer les dépendances**
Le terminal en bas s'ouvrira automatiquement. Tapez :
```bash
npm install
```

### **6. Lancer le bot**
```bash
npm start
```

Vous devriez voir : `✅ Connecté : [Votre Bot]#0000`

---

## 🔄 Garder le bot actif 24/7

### **Option 1 : Replit Premium** ($7/mois)
- Le Replit restera actif sans interruption
- Meilleure option pour la stabilité

### **Option 2 : Uptimerobot (Gratuit)**
1. Allez sur [uptimerobot.com](https://uptimerobot.com)
2. Créez un monitoring HTTP toutes les 5 minutes
3. Pointez vers l'URL de votre Replit (vous la trouverez dans la fenêtre de prévisualisation)
4. Cela "pinge" votre bot toutes les 5 minutes pour le garder actif

---

## 🆘 Dépannage

### Le bot ne démarre pas ?
- Vérifiez que `package.json` a le script `"start": "node index.js"`
- Vérifiez que le token est correct dans les **Secrets**
- Regardez les erreurs dans le terminal

### Le bot s'arrête après 10-15 minutes ?
- Vous êtes sur le plan **gratuit** de Replit
- Upgradez vers **Replit Premium** OU utilisez **Uptimerobot**

### Les fichiers disparaissent ?
- Le dossier `Data/` peut être effacé
- Utilisez une **base de données externe** (Firebase, MongoDB Atlas gratuit)

---

## ✨ Prochaines étapes

- **Ajouter Uptimerobot** pour maintenir actif (gratuit)
- **Sauvegarder vos données** ailleurs (pas sur Replit)
- **Configurer GitHub** pour des mises à jour faciles

---

**Besoin d'aide ? Posez vos questions !**
