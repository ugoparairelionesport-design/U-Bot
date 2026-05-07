const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const { exec } = require('child_process');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

class MaintenanceSystem {
  constructor(client) {
    this.client = client;
    this.watchers = new Map();
    this.lastModified = new Map();
    this.maintenanceMode = false;
    this.gitCheckInterval = null;
    this.AUTO_PULL_ENABLED = true; // Activé pour suivre le flux VS Code -> GitHub -> Replit
    this.CHECK_INTERVAL_MS = 2 * 60 * 1000; // Vérification toutes les 2 minutes (plus réactif)

    // Chemins à surveiller
    this.watchPaths = [
      path.resolve(__dirname, '../Systems'),
      path.resolve(__dirname, '../commands'),
      path.resolve(__dirname, '../index.js'),
      path.resolve(__dirname, '../deploy-commands.js')
    ];

    this.init();
  }

  init() {
    console.log('🔧 Initialisation du système de maintenance...');

    // Démarrer la surveillance automatique
    this.startFileWatching();

    // Démarrer la surveillance Git
    if (this.AUTO_PULL_ENABLED) this.startGitWatch();

    // Commande de maintenance
    this.registerMaintenanceCommands();

    console.log('✅ Système de maintenance activé');
  }

  startFileWatching() {
    this.watchPaths.forEach(watchPath => {
      if (!fs.existsSync(watchPath)) return;

      const absolutePath = path.resolve(watchPath);
      const watcher = chokidar.watch(absolutePath, {
        ignored: /(^|[\/\\])\../,
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 500,
          pollInterval: 100
        }
      });

      watcher.on('all', (event, changedPath) => {
        if (!changedPath.endsWith('.js')) return;
        this.handleFileChange(changedPath);
      });

      watcher.on('error', error => {
        console.error(`❌ Erreur watcher ${watchPath}:`, error.message);
      });

      this.watchers.set(watchPath, watcher);
      console.log(`👀 Surveillance activée: ${watchPath}`);
    });
  }

  startGitWatch() {
    if (fs.existsSync(path.resolve(__dirname, '../.git'))) {
      console.log(`📡 Auto-pull activé (intervalle: ${this.CHECK_INTERVAL_MS / 60000} min)`);
      this.checkGitUpdates(); // Vérification immédiate au démarrage
      this.gitCheckInterval = setInterval(() => {
        this.checkGitUpdates();
      }, this.CHECK_INTERVAL_MS);
    } else {
      console.warn('⚠️ Dossier .git introuvable : l\'auto-pull est désactivé.');
    }
  }

  checkGitUpdates() {
    if (this.maintenanceMode) return;
    console.log('🔄 Vérification des mises à jour sur GitHub (main)...');

    // On utilise ls-remote pour comparer le hash distant sans polluer le stdout du reset
    const checkCmd = 'git rev-parse HEAD && git ls-remote origin refs/heads/main | cut -f1';

    exec(checkCmd, (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ Erreur Git Check : ${error.message}`);
        return;
      }

      const results = stdout.split('\n').map(h => h.trim()).filter(Boolean);
      const localHash = results[0];
      const remoteHash = results[1];

      if (remoteHash && localHash !== remoteHash && remoteHash.length >= 40) {
        console.log(`✨ [GIT] Nouvelle version détectée : ${remoteHash.slice(0, 7)} (v2.8.70)`);
        const updateCmd = 'git fetch origin main && git reset --hard origin/main && git clean -fd -e Data/';
        exec(updateCmd, () => {
          if (process.env.REPL_ID || process.env.REPL_SLUG) {
            console.log('🔄 [REPLIT] Code mis à jour (v2.8.70). Redémarrage du processus...');
            // On stoppe la surveillance pour éviter les rechargements inutiles pendant le shutdown
            this.maintenanceMode = true;
            this.watchers.forEach(w => w.close()); // Ferme tous les watchers
            
            setTimeout(() => {
              try { this.cleanup(); } catch(e) {}
              process.exit(0);
            }, 2000); // Délai augmenté pour éviter le spam de redémarrage
          } else {
            this.handleReloadButton();
          }
        });
      } else {
        console.log(`✅ [GIT] Déjà à jour (${localHash ? localHash.slice(0, 7) : '???'})`);
      }
    });
  }

  handleFileChange(filePath) {
    const absolutePath = path.resolve(filePath);
    if (!absolutePath.endsWith('.js')) return;
    
    // On ignore index.js pour la surveillance car il nécessite un redémarrage manuel de toute façon
    if (absolutePath.endsWith('index.js')) return;

    const relativePath = path.relative(path.resolve(__dirname, '..'), absolutePath).replace(/\\/g, '/');
    const now = Date.now();
    const lastMod = this.lastModified.get(relativePath) || 0;

    if (now - lastMod < 1000) return; // 1 seconde de debounce

    this.lastModified.set(relativePath, now);

    console.log(`📝 Changement détecté: ${relativePath}`);

    // Attendre un peu pour que le fichier soit complètement écrit
    setTimeout(async () => {
      await this.reloadModule(absolutePath);
    }, 500);
  }

  async reloadModule(filePath) {
    try {
      const absolutePath = path.resolve(filePath);
      if (!absolutePath.endsWith('.js')) return;

      if (absolutePath.endsWith(`${path.sep}index.js`) || absolutePath.endsWith('/index.js')) {
        console.warn('⚠️ Modification de index.js détectée : un redémarrage du bot est nécessaire pour appliquer ce changement.');
        return;
      }

      // On enlève le module du cache de Node.js
      delete require.cache[absolutePath];

      const module = require(absolutePath);

      if (absolutePath.includes('configsystem.js')) {
        // On met à jour les propriétés du système de config existant
        // Cela permet de garder les références dans index.js intactes
        Object.keys(module).forEach(key => {
          this.client.configSystem[key] = module[key];
        });
        
        // On ne relance pas resumeTicketState automatiquement à chaque changement de fichier
        // car c'est une opération lourde qui fait expirer les interactions.
        if (this.client.configSystem.resumeTicketState) {
          console.log('ℹ️ configsystem.js mis à jour (resumeTicketState prêt pour le prochain lancement)');
        }
      } else if (absolutePath.includes(`${path.sep}commands${path.sep}`) || absolutePath.includes('/commands/')) {
        this.updateCommand(absolutePath, module);
      } else if (absolutePath.includes('deploy-commands.js')) {
        // Mettre à jour les commandes seulement quand deploy-commands.js change
        await this.updateCommands();
      }

      console.log(`🔄 Module rechargé: ${path.basename(absolutePath)}`);

    } catch (error) {
      console.error(`❌ Erreur rechargement ${filePath}:`, error.message);
    }
  }

  updateConfigSystem(newModule) {
    Object.keys(newModule).forEach(key => {
      this.client.configSystem[key] = newModule[key];
    });
  }

  updateCommand(filePath, module) {
    const commandName = path.basename(filePath, '.js');
    this.client.commands.set(commandName, module);
    console.log(`📋 Commande mise à jour: ${commandName}`);
  }


  async updateCommands() {
    try {
      // Recharger les commandes depuis deploy-commands.js
      const deployPath = require.resolve('../deploy-commands.js');
      delete require.cache[deployPath];
      const { commands, deployCommands } = require(deployPath);

      // Utiliser la fonction de déploiement existante qui gère déjà les logs et les erreurs
      await deployCommands();

      console.log(`🔄 ${commands.length} commandes redéployées suite à modification.`);
    } catch (error) {
      console.error('❌ Erreur mise à jour commandes:', error.message);
    }
  }

  registerMaintenanceCommands() {
    // La commande maintenance est maintenant déployée via deploy-commands.js
    console.log('🔧 Commande maintenance déjà déployée via deploy-commands.js');
  }

  async handleMaintenanceCommand(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('🔧 Panneau de Maintenance')
      .setDescription('Utilise les boutons ci-dessous pour gérer le système de maintenance du bot.')
      .addFields(
        {
          name: '📊 Statut',
          value: `Mode maintenance: ${this.maintenanceMode ? '🟢 Activé' : '🔴 Désactivé'}\nSurveillance: ${this.watchers.size > 0 ? '🟢 Active' : '🔴 Inactive'}`,
          inline: true
        },
        {
          name: '🔄 Actions',
          value: '• **Status** : État détaillé\n• **Reload** : Recharger modules\n• **Sync** : Forcer Git Pull\n• **Toggle** : Mode maintenance',
          inline: true
        }
      )
      .setColor(0x5865F2)
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('maintenance_status')
        .setLabel('📊 Status')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('maintenance_reload')
        .setLabel('🔄 Reload')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId('maintenance_sync')
        .setLabel('📡 Sync Git')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('maintenance_toggle')
        .setLabel('🔧 Toggle Mode')
        .setStyle(this.maintenanceMode ? ButtonStyle.Danger : ButtonStyle.Success)
    );

    await interaction.reply({
      embeds: [embed],
      components: [row],
      flags: 64
    });
  }

  async handleButton(interaction) {
    const customId = interaction.customId;

    switch (customId) {
      case 'maintenance_status':
        return this.handleStatusButton(interaction);
      case 'maintenance_sync':
        return this.handleSyncButton(interaction);
      case 'maintenance_reload':
        return this.handleReloadButton(interaction);
      case 'maintenance_toggle':
        return this.handleToggleButton(interaction);
      default:
        return;
    }
  }

  async handleStatusButton(interaction) {
    // Récupérer le dernier commit pour l'afficher
    const lastCommit = await new Promise(resolve => {
      exec('git log -1 --pretty=format:"%s (%h)"', (err, stdout) => {
        resolve(err ? 'Inconnu' : stdout);
      });
    });

    const statusEmbed = new EmbedBuilder()
      .setTitle('🔧 État du système de maintenance')
      .addFields(
        {
          name: 'Mode maintenance',
          value: this.maintenanceMode ? '🟢 Activé' : '🔴 Désactivé',
          inline: true
        },
        {
          name: 'Surveillance fichiers',
          value: this.watchers.size > 0 ? '🟢 Active' : '🔴 Inactive',
          inline: true
        },
        {
          name: 'Auto-Pull Git',
          value: this.gitCheckInterval ? `🟢 Activé (${this.CHECK_INTERVAL_MS / 60000} min)` : '🔴 Désactivé',
          inline: true
        },
        {
          name: 'Version (GitHub)',
          value: `\`${lastCommit}\``,
          inline: false
        },
        {
          name: 'Modules surveillés',
          value: this.watchPaths.length.toString(),
          inline: true
        }
      )
      .setColor(0x5865F2)
      .setTimestamp();

    await interaction.reply({ embeds: [statusEmbed], flags: 64 });
  }

  async handleSyncButton(interaction) {
    await interaction.reply({ content: '📡 Lancement de la synchronisation Git forcé...', flags: 64 });
    this.checkGitUpdates();
  }

  async handleReloadButton(interaction) {
    if (interaction) {
      await interaction.deferReply({ flags: 64 }).catch(() => {});
    }

    try {
      // Recharger tous les modules surveillés de manière séquentielle
      for (const watchPath of this.watchPaths) {
        if (fs.existsSync(watchPath)) {
          if (fs.statSync(watchPath).isDirectory()) {
            const files = fs.readdirSync(watchPath);
            for (const file of files) {
              if (file.endsWith('.js')) {
                await this.reloadModule(path.join(watchPath, file));
              }
            }
          } else if (watchPath.endsWith('.js')) {
            await this.reloadModule(watchPath);
          }
        }
      }

      if (interaction && (interaction.deferred || interaction.replied)) {
        await interaction.editReply({ content: '✅ Tous les modules ont été rechargés !' }).catch(() => {});
      }
    } catch (error) {
      if (interaction && (interaction.deferred || interaction.replied)) {
        await interaction.editReply({ content: `❌ Erreur lors du rechargement: ${error.message}` }).catch(() => {});
      }
    }
  }

  async handleToggleButton(interaction) {
    this.maintenanceMode = !this.maintenanceMode;

    if (this.maintenanceMode) {
      // Désactiver les mises à jour automatiques
      if (this.gitCheckInterval) {
        clearInterval(this.gitCheckInterval);
        this.gitCheckInterval = null;
      }
    } else {
      // Réactiver les mises à jour (mais elles sont maintenant manuelles)
      console.log('🔄 Mode maintenance désactivé - mises à jour sur changement de fichier uniquement');
    }

    await interaction.reply({
      content: `🔧 Mode maintenance ${this.maintenanceMode ? 'activé' : 'désactivé'}`,
      flags: 64
    });
  }

  cleanup() {
    // Nettoyer les watchers
    this.watchers.forEach(watcher => watcher.close());
    this.watchers.clear();

    // Arrêter l'auto-update
    if (this.gitCheckInterval) {
      clearInterval(this.gitCheckInterval);
      this.gitCheckInterval = null;
    }

    console.log('🧹 Système de maintenance nettoyé');
  }
}

module.exports = MaintenanceSystem;