const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const configSystem = require('./configsystem');
const fs = require('fs');
const path = require('path'); // Ajout de path pour fs.readFileSync
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
    // Vérification immédiate au lancement pour ne pas attendre 4 minutes
    this.checkAllLives().catch(err => console.error("❌ LiveSystem Initial Check Error:", err));
    
    setInterval(() => this.checkAllLives().catch(err => console.error("❌ LiveSystem Loop Error:", err)), this.checkInterval); // Catch pour éviter les plantages globaux
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
    let liveTitle = await this.fetchLiveStatus(live.platform, live.url, guild);
    const guildConfig = configSystem.getGuildConfig(guild.id);
    
    // On utilise le hashtag spécifique à ce live ou le global du serveur
    const hashtag = live.securityHashtag || guildConfig.securityHashtag;

    if (liveTitle && hashtag) {
      const cleanTitle = liveTitle.toLowerCase();
      const cleanHashtag = hashtag.toLowerCase().trim();
      
      if (!cleanTitle.includes(cleanHashtag)) {
        console.log(`ℹ️ [LIVE] Live de ${live.url} ignoré : Hashtag "${cleanHashtag}" non trouvé dans le titre.`);
        liveTitle = null; 
      }
    }

    if (liveTitle && !live.isLive) {
      await this.sendLiveNotification(guild, live, liveTitle);
    } else if (!liveTitle && live.isLive) {
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
    return data.data && data.data.length > 0 ? data.data[0].title : null;
  }

  async checkYouTube(url) {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return null;

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
    return data.items && data.items.length > 0 ? data.items[0].snippet.title : null;
  }

  async checkTikTok(url, guild) {
    // Bypass pour tes tests
    if (url.includes('test-live')) {
        const guildConfig = configSystem.getGuildConfig(guild.id);
        return `🔴 LIVE DE TEST ${guildConfig?.securityHashtag || ''} - Rejoignez l'aventure !`;
    }

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
      
      const isLive = html.includes('"room_id":') && !html.includes('"live_status":0');
      if (!isLive) return null;

      const titleMatch = html.match(/"title":"([^"]+)"/) || html.match(/"share_title":"([^"]+)"/);
      return titleMatch ? titleMatch[1] : "En direct sur TikTok";
    } catch (e) {
      return null;
    }
  }

  async cleanupLiveNotification(guild, live) {
    const channel = await guild.channels.fetch(live.channelId).catch(() => null);
    if (channel && channel.isTextBased() && live.lastMessageId) {
      const message = await channel.messages.fetch(live.lastMessageId).catch(() => null);
      if (message) await message.delete().catch(() => {});
    }
    
    live.isLive = false;
    live.lastMessageId = null;
  }

  saveUpdate(config) {
    // On utilise une lecture/écriture synchrone fraîche pour éviter les conflits de cache
    // et s'assurer que les modifications du LiveSystem sont persistantes.
    try {
      const configPath = path.join(__dirname, '../Data/config.json');
      // On ne lit pas le fichier à nouveau ici, on utilise l'objet 'config' passé en paramètre
      // qui a été mis à jour dans checkAllLives.
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2)); 
    } catch (err) {
      console.error("❌ Erreur sauvegarde LiveSystem:", err);
    }
  }
}

module.exports = LiveSystem;