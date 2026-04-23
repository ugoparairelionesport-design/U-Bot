# Système de Maintenance - Bot Discord

## Vue d'ensemble
Le système de maintenance assure que le bot reste opérationnel 24/7 avec des mises à jour automatiques en temps réel sans nécessiter de redémarrage.

## Fonctionnalités

### 🔄 Mise à jour automatique
- **Surveillance des fichiers** : Tous les fichiers `.js` dans `Systems/` et `commands/` sont surveillés
- **Rechargement automatique** : Les modules modifiés sont rechargés instantanément
- **Mise à jour des commandes** : Les commandes slash sont mises à jour toutes les 10 secondes

### 🛠️ Commandes de maintenance
Utilisez `/maintenance <action>` pour contrôler le système :

- **status** : Affiche l'état actuel du système de maintenance
- **reload** : Force le rechargement de tous les modules
- **toggle_mode** : Active/désactive le mode maintenance (arrête les mises à jour automatiques)

### 📊 Monitoring
- **Logs détaillés** : Toutes les actions sont loggées dans la console
- **Gestion d'erreurs** : Les erreurs sont gérées gracieusement sans crash
- **Nettoyage automatique** : Les ressources sont nettoyées lors de l'arrêt

## Architecture

### Fichiers surveillés
- `Systems/configsystem.js` - Système de tickets
- `Systems/maintenance.js` - Système de maintenance
- `commands/*.js` - Toutes les commandes
- `index.js` - Handlers principaux
- `deploy-commands.js` - Déploiement des commandes

### Processus de mise à jour
1. **Détection** : Changement de fichier détecté
2. **Debounce** : Attente de 1 seconde pour éviter les changements multiples
3. **Rechargement** : Module retiré du cache et rechargé
4. **Mise à jour** : Références mises à jour dans le client
5. **Confirmation** : Log de confirmation affiché

## Sécurité
- **Mode maintenance** : Peut être activé pour désactiver les mises à jour automatiques
- **Gestion d'erreurs** : Les erreurs de rechargement n'arrêtent pas le bot
- **Nettoyage** : Toutes les ressources sont nettoyées lors de l'arrêt

## Utilisation
1. Le système se lance automatiquement avec le bot
2. Utilisez `/maintenance status` pour vérifier l'état
3. Modifiez les fichiers - ils seront rechargés automatiquement
4. En cas de problème, utilisez `/maintenance reload` pour forcer un rechargement

## Logs
Le système produit les logs suivants :
- `🔧 Initialisation du système de maintenance...`
- `👀 Surveillance activée: [chemin]`
- `📝 Changement détecté: [fichier]`
- `🔄 Module rechargé: [nom]`
- `🔄 Commandes mises à jour automatiquement`
- `🧹 Système de maintenance nettoyé`