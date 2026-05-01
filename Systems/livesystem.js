const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const configSystem = require('./configsystem');
const fs = require('fs');
const path = require('path');
const { fetch } = require('undici'); // Utilisation de undici (déjà dans package.json)

class LiveSystem {
  constructor(client) {
    this.client = client;
    this.checkInterval = 4 * 60 * 1000; // Vérification toutes les 4 minutes
    this.twitchToken = null;
    this.twitchTokenExpires = 0;
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

    let modified = false;
    for (const guildId of Object.keys(config.guilds)) {
      const guildConfig = config.guilds[guildId];
      if (!guildConfig.liveConfigs || guildConfig.liveConfigs.length === 0) continue;

      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) continue;

      for (const live of guildConfig.liveConfigs) {
        const wasLive = live.isLive;
        const msgId = live.lastMessageId;

        await this.processLiveCheck(guild, live);
        
        if (wasLive !== live.isLive || msgId !== live.lastMessageId) {
          modified = true;
        }
      }
    }

    if (modified) this.saveUpdate(config);
  }

  async processLiveCheck(guild, live) {
    const isCurrentlyLive = await this.fetchLiveStatus(live.platform, live.url);

    if (isCurrentlyLive && !live.isLive) {
      await this.sendLiveNotification(guild, live);
    } else if (!isCurrentlyLive && live.isLive) {
      await this.cleanupLiveNotification(guild, live);
    }
  }

  async getTwitchToken() {
    if (this.twitchToken && Date.now() < this.twitchTokenExpires) return this.twitchToken;

    const clientID = process.env.TWITCH_CLIENT_ID;
    const clientSecret = process.env.TWITCH_CLIENT_SECRET;
    if (!clientID || !clientSecret) return null;

    const res = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${clientID}&client_secret=${clientSecret}&grant_type=client_credentials`, { method: 'POST' });
    const data = await res.json();
    
    this.twitchToken = data.access_token;
    this.twitchTokenExpires = Date.now() + (data.expires_in * 1000) - 60000;
    return this.twitchToken;
  }

  async checkTwitch(url) {
    const token = await this.getTwitchToken();
    const clientID = process.env.TWITCH_CLIENT_ID;
    if (!token || !clientID) return false;

    const username = url.split('/').pop();
    const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${username}`, {
      headers: { 'Client-ID': clientID, 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    return data.data && data.data.length > 0;
  }

  async checkYouTube(url) {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return false;

    // Extraction propre de l'ID ou du handle
    const handleMatch = url.match(/@([^/?]+)/);
    let queryUrl;

    if (handleMatch) {
      // Si c'est un @pseudo, on cherche via search (nécessite que la chaîne soit indexée)
      queryUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${handleMatch[1]}&type=video&eventType=live&key=${apiKey}`;
    } else {
      const channelId = url.split('/').pop();
      queryUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&eventType=live&key=${apiKey}`;
    }

    const res = await fetch(queryUrl);
    const data = await res.json();
    return data.items && data.items.length > 0;
  }

  async checkTikTok(url) {
    // Bypass pour tes tests
    if (url.includes('test-live')) return true;

    try {
      // Extraction plus robuste du pseudo (gère @pseudo ou juste le lien)
      const match = url.match(/@([^/?#]+)/);
      const username = match ? match[1] : url.split('/').pop();
      if (!username) return false;

      // On tente d'accéder à la page de live directement
      const res = await fetch(`https://www.tiktok.com/@${username}/live`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      
      if (!res.ok) return false;
      const html = await res.text();
      
      // Si la page contient "room_id" et n'est pas une redirection vers le profil, c'est probablement live
      return html.includes('"room_id":') && !html.includes('"live_status":0');
    } catch (e) {
      return false;
    }
  }

  async fetchLiveStatus(platform, url) {
    try {
      if (platform === 'twitch') return await this.checkTwitch(url);
      if (platform === 'youtube') return await this.checkYouTube(url);
      if (platform === 'tiktok') return await this.checkTikTok(url);
      return false;
    } catch (err) {
      console.error(`❌ Erreur check ${platform}:`, err.message);
      return false;
    }
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
  }

  saveUpdate(config) {
    // On utilise une lecture/écriture synchrone fraîche pour éviter les conflits de cache
    try {
      const configPath = path.join(__dirname, '../Data/config.json');
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    } catch (err) {
      console.error("❌ Erreur sauvegarde LiveSystem:", err);
    }
  }
}

module.exports = LiveSystem;