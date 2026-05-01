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
    console.log(`🔍 [LIVE] Vérification en cours pour ${this.client.guilds.cache.size} serveur(s)...`);

    for (const [guildId, guild] of this.client.guilds.cache) {
      const guildConfig = configSystem.getGuildConfig(guildId);
      if (!guildConfig.liveConfigs || guildConfig.liveConfigs.length === 0) continue;

      console.log(`📡 [LIVE] ${guildConfig.liveConfigs.length} config(s) trouvée(s) pour le serveur ${guildId}`);

      for (const live of guildConfig.liveConfigs) {
        await this.processLiveCheck(guild, live);
      }
    }
  }

  async processLiveCheck(guild, live) {
    let liveTitle = await this.fetchLiveStatus(live.platform, live.url, guild);
    const guildConfig = configSystem.getGuildConfig(guild.id);
    
    if (liveTitle) {
        console.log(`📡 [LIVE] Détecté pour ${live.url} | Titre: "${liveTitle}"`);
    }

    // On utilise le hashtag spécifique à ce live ou le global du serveur
    const hashtag = live.securityHashtag || guildConfig.securityHashtag;

    if (liveTitle && hashtag) {
      const cleanTitle = liveTitle.toLowerCase();
      const cleanHashtag = hashtag.toLowerCase().trim();
      
      if (!cleanTitle.includes(cleanHashtag)) {
        console.log(`ℹ️ [LIVE] Live de ${live.url} ignoré : Hashtag "${cleanHashtag}" absent du titre.`);
        liveTitle = null; 
      }
    }

    if (liveTitle && !live.isLive) {
        console.log(`🚀 [LIVE] Tentative d'envoi de notification pour ${live.url}...`);
        await this.sendLiveNotification(guild, live, liveTitle);
    } else if (liveTitle && live.isLive) {
        console.log(`ℹ️ [LIVE] Notification déjà active pour ${live.url} (isLive: true).`);
    } else if (!liveTitle && live.isLive) {
      console.log(`🧹 [LIVE] Fin de live détectée pour ${live.url}.`);
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

    const username = url.replace(/<|>/g, '').split('/').pop();
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
    const cleanUrl = url.replace(/<|>/g, '');
    const handleMatch = cleanUrl.match(/@([^/?]+)/);
    let queryUrl;

    if (handleMatch) {
      // Si c'est un @pseudo, on cherche via search (nécessite que la chaîne soit indexée)
      queryUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${handleMatch[1]}&type=video&eventType=live&maxResults=1&key=${apiKey}`;
    } else {
      const channelId = cleanUrl.split('/').pop();
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
      const cleanUrl = url.replace(/<|>/g, '');
      const match = cleanUrl.match(/@([^/?#]+)/);
      const username = match ? match[1] : cleanUrl.split('/').pop();
      if (!username) return false;

      // On tente d'accéder à la page de live directement
      const res = await fetch(`https://www.tiktok.com/@${username}/live`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      
      if (!res.ok) {
        console.error(`❌ [TIKTOK] Erreur HTTP ${res.status} pour ${username}`);
        return false;
      }

      const html = await res.text();
      
      const isLive = html.includes('"room_id":') && !html.includes('"live_status":0');
      if (!isLive) return null; // Retourne null si pas de live détecté dans le HTML

      const titleMatch = html.match(/"title":"([^"]+)"/) || html.match(/"share_title":"([^"]+)"/);
      if (titleMatch) {
        // Décodage des caractères Unicode (\u0023 -> #, etc.) pour la détection du hashtag
        return titleMatch[1].replace(/\\u([0-9a-fA-F]{4})/g, (match, grp) => {
          return String.fromCharCode(parseInt(grp, 16));
        }).replace(/\\u002F/g, '/');
      }
      return "En direct sur TikTok";
    } catch (e) {
      return null;
    }
  }

  async fetchLiveStatus(platform, url, guild) {
    try {
      if (platform === 'twitch') return await this.checkTwitch(url);
      if (platform === 'youtube') return await this.checkYouTube(url);
      if (platform === 'tiktok') return await this.checkTikTok(url, guild);
      return null;
    } catch (err) {
      console.error(`❌ Erreur check ${platform}:`, err.message);
      return null;
    }
  }

  async sendLiveNotification(guild, live, liveTitle) {
    try {
      if (platform === 'twitch') return await this.checkTwitch(url);
      if (platform === 'youtube') return await this.checkYouTube(url);
      if (platform === 'tiktok') return await this.checkTikTok(url, guild);
      return null;
    } catch (err) {
      console.error(`❌ Erreur check ${platform}:`, err.message);
      return null;
    }
  }

  async sendLiveNotification(guild, live, liveTitle) {
    if (!live.channelId) {
        console.error(`❌ [LIVE] Aucun salon de destination (channelId) configuré pour ${live.url}`);
        return;
    }

    const channel = await guild.channels.fetch(live.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
        console.error(`❌ [LIVE] Salon ${live.channelId} introuvable ou inaccessible pour ${live.url}`);
        return;
    }

    const platformData = {
      twitch: { color: "#9146FF", name: 'Twitch', emoji: '💜', favicon: 'https://www.twitch.tv/favicon.ico' },
      youtube: { color: "#FF0000", name: 'YouTube', emoji: '❤️', favicon: 'https://www.youtube.com/favicon.ico' },
      tiktok: { color: "#010101", name: 'TikTok', emoji: '🖤', favicon: 'https://www.tiktok.com/favicon.ico' }
    };

    const data = platformData[live.platform];
    const channelInfo = await this._fetchChannelInfo(live.platform, live.url);
    const displayName = channelInfo.displayName || live.url.split('/').pop().replace('@', '');
    const profilePic = channelInfo.profilePictureUrl || data.favicon;

    const embed = new EmbedBuilder()
      .setAuthor({ name: `${displayName} est en LIVE maintenant !`, iconURL: profilePic })
      .setTitle(`${data.emoji} ${liveTitle || `Rejoignez le live de ${displayName} sur ${data.name} !`}`)
      .setURL(live.url.replace(/<|>/g, ''))
      .addFields(
        { name: '🎮 Plateforme', value: `\`${data.name}\``, inline: true },
        { name: '👥 Audience', value: `\`En direct\``, inline: true },
        { name: '🔗 Lien direct', value: `Cliquez ici`, inline: true }
      )
      .setColor(data.color || "#5865F2")
      .setImage(profilePic)
      .setFooter({ text: `U-Bot System • ${data.name} Notification`, iconURL: data.favicon })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel(`Visualiser le live sur ${data.name}`)
        .setURL(live.url.replace(/<|>/g, ''))
        .setStyle(ButtonStyle.Link)
    );

    const content = `${live.roleId ? `<@&${live.roleId}>` : ""}\n🔥 **Alerte Détection :** Un nouveau direct vient de commencer !\n${live.url.replace(/<|>/g, '')}`;
    
    const message = await channel.send({ content, embeds: [embed], components: [row] }).catch(() => null);
    
    if (message) {
      live.isLive = true;
      live.lastMessageId = message.id;
      configSystem.saveConfig(configSystem.getFullConfig());
      console.log(`✅ [LIVE] Notification envoyée avec succès dans #${channel.name}`);
    } else {
      console.error(`❌ [LIVE] Échec de l'envoi du message dans #${channel.name}. Vérifiez mes permissions (Envoyer des messages, Intégrer des liens).`);
    }
  }

  async _fetchChannelInfo(platform, url) {
    let info = { displayName: null, profilePictureUrl: null };
    try {
      const cleanUrl = url.replace(/<|>/g, '');
      if (platform === 'twitch') {
        const token = await this.getTwitchToken();
        const clientID = process.env.TWITCH_CLIENT_ID;
        if (!token || !clientID) return info;
        const username = cleanUrl.split('/').pop();
        const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${username}`, {
            headers: { 'Client-ID': clientID, 'Authorization': `Bearer ${token}` }
        });
        const userData = await userRes.json();
        if (userData.data?.[0]) {
            info.displayName = userData.data[0].display_name;
            info.profilePictureUrl = userData.data[0].profile_image_url;
        }
      } else if (platform === 'youtube') {
        const apiKey = process.env.YOUTUBE_API_KEY;
        if (!apiKey) return info;
        const channelId = cleanUrl.split('/').pop();
        const channelRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${apiKey}`);
        const channelData = await channelRes.json();
        if (channelData.items?.[0]) {
            info.displayName = channelData.items[0].snippet.title;
            info.profilePictureUrl = channelData.items[0].snippet.thumbnails.high.url;
        }
      } else if (platform === 'tiktok') {
        const match = cleanUrl.match(/@([^/?#]+)/);
        const username = match ? match[1] : cleanUrl.split('/').pop();
        const res = await fetch(`https://www.tiktok.com/@${username}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' }
        });
        if (res.ok) {
          const html = await res.text();
          const stateMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([\s\S]*?)<\/script>/);
          if (stateMatch) {
            const jsonData = JSON.parse(stateMatch[1]);
            const userData = jsonData?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo?.user;
            if (userData) {
              info.profilePictureUrl = userData.avatarLarger || userData.avatarMedium;
              info.displayName = userData.nickname || username;
            }
          }
        }
      }
    } catch (e) { console.error("❌ Info fetch error:", e.message); }
    return info;
  }

  async cleanupLiveNotification(guild, live) {
    const channel = await guild.channels.fetch(live.channelId).catch(() => null);
    if (channel && channel.isTextBased() && live.lastMessageId) {
      const message = await channel.messages.fetch(live.lastMessageId).catch(() => null);
      if (message) await message.delete().catch(() => {});
    }
    
    live.isLive = false;
    live.lastMessageId = null;
    configSystem.saveConfig(configSystem.getFullConfig());
  }
}

module.exports = LiveSystem;