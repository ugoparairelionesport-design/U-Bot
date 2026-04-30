const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const configSystem = require('./configsystem');

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
    // On récupère la config globale
    const config = configSystem.resumeTicketState ? require('../Data/config.json') : {}; 
    if (!config.guilds) return;

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
      twitch: { color: 0x6441A5, name: 'Twitch', emoji: '💜' },
      youtube: { color: 0xFF0000, name: 'YouTube', emoji: '❤️' },
      tiktok: { color: 0x010101, name: 'TikTok', emoji: '🖤' }
    };

    const data = platformData[live.platform];

    const embed = new EmbedBuilder()
      .setTitle(`${data.emoji} Alerte Live ${data.name}`)
      .setURL(live.url)
      .setDescription(live.text)
      .addFields({ name: 'Lien du live', value: `Cliquez ici pour regarder` })
      .setColor(data.color)
      .setImage('https://i.imgur.com/example-preview.png') // On pourrait récupérer la preview via API
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel(`Regarder sur ${data.name}`)
        .setURL(live.url)
        .setStyle(ButtonStyle.Link)
    );

    const content = live.roleId ? `<@&${live.roleId}>` : null;
    
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
    const fs = require('fs');
    const path = require('path');
    fs.writeFileSync(path.join(__dirname, '../Data/config.json'), JSON.stringify(config, null, 2));
  }
}

module.exports = LiveSystem;