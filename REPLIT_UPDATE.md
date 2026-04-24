# Mise a jour Replit

## Source de verite

Le depot GitHub et la branche `master` sont la source de verite.
Le Replit doit rester sur `master`.

## Verifier la branche active dans Replit

```bash
git branch --show-current
```

Le resultat attendu est :

```bash
master
```

## Mettre a jour le bot dans Replit

Dans le Shell Replit :

```bash
git pull origin master
npm install
npm start
```

## Verifier les derniers commits

```bash
git log --oneline -n 5
```

## Si Replit est encore sur `main`

```bash
git fetch origin master:refs/remotes/origin/master
git checkout -b master origin/master || git checkout master
git pull origin master
```

## Si Git refuse de changer de branche a cause de fichiers modifies

```bash
git stash push -u -m "backup before master switch"
git checkout -b master origin/master || git checkout master
git pull origin master
```

## Important

- Ne pas lancer ces commandes dans le chat de l'agent Replit
- Les lancer dans le vrai `Shell`
- Si `npm install` demande l'installation des outils Node Replit, repondre `y`
