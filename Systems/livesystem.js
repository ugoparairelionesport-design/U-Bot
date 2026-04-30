const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const configSystem = require('./configsystem');
const fs = require('fs');
const path = require('path');

class LiveSystem {
  constructor(client) {
    this.client = client;
    this.checkInterval = 5 * 60 * 1000; // Vérification toutes les 5 minutes
    this.init();
  }

  init() {
    setInterval(() => this.checkAllLives(), this.checkInterval);
    console.log('📡 Système de détection Live initialisé');
  }

  async checkAllLives() {
    // On lit le fichier de config à chaque fois pour éviter le cache require
    let config;
    try {
      const configPath = path.join(__dirname, '../Data/config.json');
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) { return; }
    
    if (!config || !config.guilds) return;

    for (const guildId of Object.keys(config.guilds)) {
      const guildConfig = config.guilds[guildId];
      if (!guildConfig.liveConfigs || guildConfig.liveConfigs.length === 0) continue;

      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) continue;

      for (const live of guildConfig.liveConfigs) {
        await this.processLiveCheck(guild, live);
      }
    }
  }

  async processLiveCheck(guild, live) {
    // Simulation de détection (Nécessite normalement les APIs Twitch/YT/TikTok)
    // Ici, nous implémentons la logique de gestion des messages
    const isCurrentlyLive = await this.fetchLiveStatus(live.platform, live.url);

    if (isCurrentlyLive && !live.isLive) {
      // Le streamer vient de passer en live
      await this.sendLiveNotification(guild, live);
    } else if (!isCurrentlyLive && live.isLive) {
      // Le live est fini
      await this.cleanupLiveNotification(guild, live);
    }
  }

  async fetchLiveStatus(platform, url) {
    // Note : C'est ici qu'on appellerait les APIs (Twitch Helix, YT Data v3)
    // Pour le moment, on retourne false (à connecter aux APIs réelles)
    return false; 
  }

  async sendLiveNotification(guild, live) {
    const channel = await guild.channels.fetch(live.channelId).catch(() => null);
    if (!channel) return;

    const platformData = {
      twitch: { color: "#6441A5", name: 'Twitch', emoji: '💜' },
      youtube: { color: "#FF0000", name: 'YouTube', emoji: '❤️' },
      tiktok: { color: "#010101", name: 'TikTok', emoji: '🖤' }
    };

    const data = platformData[live.platform];

    const embed = new EmbedBuilder()
      .setTitle(`${data.emoji} ALERT LIVE - ${data.name.toUpperCase()}`)
      .setURL(live.url)
      .setDescription(`>>> ${live.text}`)
      .setColor(data.color || "#5865F2")
      .setThumbnail(`https://www.google.com/s2/favicons?sz=64&domain=${live.platform}.com`)
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel(`Visualiser le live sur ${data.name}`)
        .setURL(live.url)
        .setStyle(ButtonStyle.Link)
    );

    // On met le lien dans le content pour que Discord génère le lecteur automatique
    const content = `${live.roleId ? `<@&${live.roleId}> ` : ""}\n**${data.emoji} LE LIVE COMMENCE :** ${live.url}`;
    
    const message = await channel.send({ content, embeds: [embed], components: [row] }).catch(() => null);
    
    if (message) {
      live.isLive = true;
      live.lastMessageId = message.id;
      this.saveUpdate();
    }
  }

  async cleanupLiveNotification(guild, live) {
    const channel = await guild.channels.fetch(live.channelId).catch(() => null);
    if (channel && live.lastMessageId) {
      const message = await channel.messages.fetch(live.lastMessageId).catch(() => null);
      if (message) await message.delete().catch(() => {});
    }
    
    live.isLive = false;
    live.lastMessageId = null;
    this.saveUpdate();
  }

  saveUpdate() {
    // On force la sauvegarde via le configsystem
    const config = require('../Data/config.json');
    fs.writeFileSync(path.join(__dirname, '../Data/config.json'), JSON.stringify(config, null, 2));
  }
}

module.exports = LiveSystem;