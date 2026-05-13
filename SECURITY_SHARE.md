# Partage du bot sans secrets

Ne partage jamais ces fichiers :

- `.env`
- `Data/config.json`
- `Data/assets/`
- `u-bot-discloud.zip`
- toute archive créée pour ton propre déploiement

Le fichier `u-bot-discloud.zip` est privé : il peut contenir les variables nécessaires à TON app Discloud.

Pour envoyer le bot à quelqu'un d'autre, utilise uniquement :

```powershell
powershell -ExecutionPolicy Bypass -File scripts\package-share.ps1
```

Cela génère `u-bot-share.zip`, sans token Discord, sans clés API, sans configuration serveur et sans données privées.

La personne qui reçoit le bot doit créer son propre `.env` à partir de `.env.example`.

Informations considérées sensibles :

- token Discord du bot ;
- clés API Groq, Twitch, YouTube ;
- IDs de serveurs/salons/rôles si tu ne veux pas exposer l'organisation de ton serveur ;
- statistiques, tickets, logs et configurations stockés dans `Data/config.json` ;
- images ou assets privés placés dans `Data/assets/`.
