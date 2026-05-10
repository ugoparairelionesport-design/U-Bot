# Copier-coller fichier par fichier dans Visual Studio Code

Ce dossier sépare les fichiers modifiés un par un pour éviter de copier un énorme document unique.

## Ordre conseillé

1. Ouvrir `COPY_PASTE_VSCODE/01_index.js.md`, copier le bloc complet, puis remplacer tout `index.js`.
2. Ouvrir `COPY_PASTE_VSCODE/02_Systems_configsystem.js.md`, copier le bloc complet, puis remplacer tout `Systems/configsystem.js`.
3. Ouvrir `COPY_PASTE_VSCODE/03_Systems_antispam.js.md`, copier le bloc complet, puis remplacer tout `Systems/antispam.js`.

## Après collage

Dans le terminal Visual Studio Code/Replit :

```bash
node --check index.js
node --check Systems/configsystem.js
node --check Systems/antispam.js
npm start
```

## Important

- Il faut remplacer le contenu entier de chaque fichier cible.
- Ne copiez pas les lignes ```js et ``` : copiez seulement le code à l'intérieur du bloc.
- Gardez le token Discord dans les Secrets Replit ou dans votre `.env` local, jamais dans ces fichiers.
