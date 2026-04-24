const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const { REST, Routes, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

class MaintenanceSystem {
  constructor(client) {
    this.client = client;
    this.watchers = new Map();
    this.lastModified = new Map();
    this.maintenanceMode = false;
    this.autoUpdateInterval = null;

    // Chemins à surveiller
    this.watchPaths = [
      './Systems',
      './commands',
      './index.js',
      './deploy-commands.js'
    ];

    this.init();
  }

  init() {
    console.log('🔧 Initialisation du système de maintenance...');

    // Démarrer la surveillance automatique
    this.startFileWatching();

    // Démarrer la mise à jour automatique des commandes
    this.startAutoUpdate();

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

  watchDirectory(dirPath) {
    // Méthode conservée pour compatibilité, la surveillance utilise chokidar.
  }

  handleFileChange(filePath) {
    const absolutePath = path.resolve(filePath);
    if (!absolutePath.endsWith('.js')) return;

    const relativePath = path.relative(path.resolve(__dirname, '..'), absolutePath).replace(/\\/g, '/');

    // Éviter les changements trop fréquents (débounce)
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

      delete require.cache[absolutePath];

      // Recharger le module
      const module = require(absolutePath);

      // Mettre à jour les références selon le fichier
      if (absolutePath.includes('configsystem.js')) {
        this.updateConfigSystem(module);
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
    // Mettre à jour les références dans le client
    Object.assign(this.client.configSystem, newModule);
  }

  updateCommand(filePath, module) {
    const commandName = path.basename(filePath, '.js');
    this.client.commands.set(commandName, module);
    console.log(`📋 Commande mise à jour: ${commandName}`);
  }

  updateMainHandlers() {
    // Rechargement complet de index.js non pris en charge sans redémarrage
    console.warn('⚠️ Rechargement de index.js non pris en charge. Redémarrez le bot pour appliquer ces changements.');
  }

  startAutoUpdate() {
    // Mise à jour automatique des commandes seulement si nécessaire
    // Les commandes seront mises à jour uniquement lors des changements de fichiers
    console.log('🔄 Mise à jour automatique des commandes désactivée (mise à jour sur changement uniquement)');
  }

  async updateCommands() {
    try {
      // Recharger les commandes depuis deploy-commands.js
      delete require.cache[require.resolve('../deploy-commands.js')];
      const { commands } = require('../deploy-commands.js');

      // Déployer les commandes
      await this.client.application.commands.set(commands);

      console.log('🔄 Commandes mises à jour suite à modification de deploy-commands.js');
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
          value: '• **Status** : Voir l\'état détaillé\n• **Reload** : Recharger tous les modules\n• **Toggle** : Basculer le mode maintenance',
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
      case 'maintenance_reload':
        return this.handleReloadButton(interaction);
      case 'maintenance_toggle':
        return this.handleToggleButton(interaction);
      default:
        return;
    }
  }

  async handleStatusButton(interaction) {
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
          name: 'Mise à jour auto',
          value: this.autoUpdateInterval ? '🟢 Active (10s)' : '🔴 Inactive',
          inline: true
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

  async handleReloadButton(interaction) {
    await interaction.deferReply({ flags: 64 });

    try {
      // Recharger tous les modules surveillés
      this.watchPaths.forEach(watchPath => {
        if (fs.existsSync(watchPath)) {
          if (fs.statSync(watchPath).isDirectory()) {
            fs.readdirSync(watchPath).forEach(file => {
              if (file.endsWith('.js')) {
                this.reloadModule(path.join(watchPath, file));
              }
            });
          } else if (watchPath.endsWith('.js')) {
            this.reloadModule(watchPath);
          }
        }
      });

      await interaction.editReply({ content: '✅ Tous les modules ont été rechargés !' });
    } catch (error) {
      await interaction.editReply({ content: `❌ Erreur lors du rechargement: ${error.message}` });
    }
  }

  async handleToggleButton(interaction) {
    this.maintenanceMode = !this.maintenanceMode;

    if (this.maintenanceMode) {
      // Désactiver les mises à jour automatiques
      if (this.autoUpdateInterval) {
        clearInterval(this.autoUpdateInterval);
        this.autoUpdateInterval = null;
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
    if (this.autoUpdateInterval) {
      clearInterval(this.autoUpdateInterval);
      this.autoUpdateInterval = null;
    }

    console.log('🧹 Système de maintenance nettoyé');
  }
}

module.exports = MaintenanceSystem;