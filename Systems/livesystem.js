const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const configSystem = require('./configsystem');
const fs = require('fs');
const path = require('path');
const { fetch } = require('undici');

class LiveSystem {
  constructor(client) {
    this.client = client;
    this.checkInterval = 30 * 1000; // Vérification toutes les 30 secondes
    this.twitchTokenExpires = 0;
    this.cache = new Map(); // Cache pour avatars et résolutions d'ID
    this.init();
  }

  init() {
    // La vérification initiale est maintenant gérée par index.js au moment du Ready
    setInterval(() => this.checkAllLives().catch(err => console.error("❌ LiveSystem Loop Error:", err)), this.checkInterval); // Catch pour éviter les plantages globaux
    console.log('📡 Système de détection Live initialisé');
  }

  async checkAllLives() {
    console.log(`🔍 [LIVE] Vérification en cours pour ${this.client.guilds.cache.size} serveur(s)...`);
    const checkPromises = [];
    let hasChanged = false;
    
    for (const [guildId, guild] of this.client.guilds.cache) {
      const guildConfig = configSystem.getGuildConfig(guildId);
      if (!guildConfig.liveConfigs || guildConfig.liveConfigs.length === 0) continue;

      for (const live of guildConfig.liveConfigs) {
        // On lance toutes les vérifications en parallèle pour une latence minimale
        checkPromises.push(this.processLiveCheck(guild, live).then(changed => {
          if (changed) hasChanged = true;
        }));
      }
    }
    
    await Promise.allSettled(checkPromises);

    // Sauvegarder l'état seulement si nécessaire
    if (hasChanged) {
      configSystem.saveConfig(configSystem.getFullConfig());
    }
  }

  async processLiveCheck(guild, live) {
    const status = await this.fetchLiveStatus(live.platform, live.url, guild).catch(() => null);
    let liveTitle = status?.title || null;
    let wasLive = live.isLive;

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
        console.log(`ℹ️ [LIVE] Live de ${live.url} ignoré : Hashtag "${cleanHashtag}" non trouvé dans le titre.`);
        liveTitle = null; 
      }
    }

    if (liveTitle && !live.isLive) {
        live.tempInfo = status; // Stockage temporaire des metadata
        console.log(`🚀 [LIVE] Tentative d'envoi de notification pour ${live.url}...`);
        await this.sendLiveNotification(guild, live, liveTitle);
        return true;
    } else if (liveTitle && live.isLive) {
        return false;
    } else if (!liveTitle && live.isLive) {
      console.log(`🧹 [LIVE] Fin de live détectée pour ${live.url}.`);
      await this.cleanupLiveNotification(guild, live);
      return true;
    }
    return false;
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
    
    // Récupération avatar en cache ou API
    if (!this.cache.has(`twitch_avatar_${username}`)) {
      const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${username}`, {
        headers: { 'Client-ID': clientID, 'Authorization': `Bearer ${token}` }
      });
      const userData = await userRes.json();
      if (userData && userData.data && userData.data[0]) {
        this.cache.set(`twitch_avatar_${username}`, userData.data[0].profile_image_url);
      }
    }

    const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${username}`, {
      headers: { 'Client-ID': clientID, 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    return data.data && data.data.length > 0 ? { title: data.data[0].title, displayName: data.data[0].user_name, avatar: this.cache.get(`twitch_avatar_${username}`) } : null;
  }

  async checkYouTube(url) {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return null;

    // Extraction propre de l'ID ou du handle
    const cleanUrl = url.replace(/<|>/g, '');
    const handleMatch = cleanUrl.match(/@([^/?]+)/);
    let queryUrl;

    if (handleMatch) {
      const handle = handleMatch[1];
      if (!this.cache.has(`yt_id_${handle}`)) {
        // Résolution du handle en ID (opération coûteuse, mise en cache)
        const resolve = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${handle}&type=channel&maxResults=1&key=${apiKey}`);
        const res = await resolve.json();
        if (res.items?.[0]) this.cache.set(`yt_id_${handle}`, res.items[0].id.channelId);
      }
      const channelId = this.cache.get(`yt_id_${handle}`);
      queryUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&eventType=live&key=${apiKey}`;
    } else {
      const channelId = cleanUrl.split('/').pop();
      queryUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&eventType=live&key=${apiKey}`;
    }

    const res = await fetch(queryUrl);
    const data = await res.json();
    if (data.items && data.items.length > 0) {
      return {
        title: data.items[0].snippet.title,
        displayName: data.items[0].snippet.channelTitle,
        avatar: data.items[0].snippet.thumbnails.high.url
      };
    }
    return null;
  }

  async checkTikTok(url, guild) {
    // Bypass pour tes tests
    if (url.includes('test-live')) {
        const guildConfig = configSystem.getGuildConfig(guild.id);
        return { 
            title: `🔴 LIVE DE TEST ${guildConfig?.securityHashtag || ''} - Rejoignez l'aventure !`, 
            displayName: "Test Live Account", 
            avatar: null 
        };
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
      
      if (!res.ok) return false;
      const html = await res.text();
      
      const isLive = html.includes('"room_id":') && !html.includes('"live_status":0');
      if (!isLive) return null;

      const stateMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([\s\S]*?)<\/script>/);
      if (stateMatch) {
        const jsonData = JSON.parse(stateMatch[1]);
        const liveData = jsonData?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.liveRoom;
        const userData = jsonData?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo?.user;
        
        return {
          title: liveData?.title || "En direct sur TikTok",
          displayName: userData?.nickname || username,
          avatar: userData?.avatarLarger || userData?.avatarMedium
        };
      }

      return { title: "En direct sur TikTok", displayName: username, avatar: null };
    } catch (e) {
      return null;
    }
  }

  async fetchLiveStatus(platform, url, guild) {
    // Cette fonction est responsable de vérifier le statut live sur la plateforme
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
    // Cette fonction est responsable d'envoyer la notification Discord
    if (!live.channelId) {
        console.error(`❌ [LIVE] Aucun salon de destination (channelId) configuré pour ${live.url}`);
        return;
    }

    const channel = await guild.channels.fetch(live.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const platformData = {
      twitch: { color: "#9146FF", name: 'Twitch', emoji: '💜', favicon: 'https://www.twitch.tv/favicon.ico' },
      youtube: { color: "#FF0000", name: 'YouTube', emoji: '❤️', favicon: 'https://www.youtube.com/favicon.ico' },
      tiktok: { color: "#010101", name: 'TikTok', emoji: '🖤', favicon: 'https://www.tiktok.com/favicon.ico' }
    };

    const data = platformData[live.platform];
    // On passe directement les infos récupérées lors du check pour éviter un second appel API
    const displayName = live.tempInfo?.displayName || live.url.split('/').pop().replace('@', '');
    const profilePic = live.tempInfo?.avatar || data.favicon;
    const guildConfig = configSystem.getGuildConfig(guild.id);
    const banner = guildConfig.globalEmbedBanner || profilePic;

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
      .setImage(banner)
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
      console.log(`✅ [LIVE] Notification envoyée pour ${live.url} dans #${channel.name}`);
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
    // La sauvegarde est maintenant gérée par checkAllLives
  }
}

module.exports = LiveSystem;