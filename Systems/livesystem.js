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
    let liveTitle = await this.fetchLiveStatus(live.platform, live.url);
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

  async checkTikTok(url) {
    // Bypass pour tes tests
    if (url.includes('test-live')) {
        const guildConfig = configSystem.getGuildConfig(this.client.guilds.cache.first()?.id);
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

  async sendLiveNotification(guild, live, liveTitle) {
    const channel = await guild.channels.fetch(live.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

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
      .setAuthor({ 
        name: `${displayName} est en LIVE maintenant !`, 
        iconURL: profilePic
      })
      .setTitle(`${data.emoji} ${liveTitle || `Rejoignez le live de ${displayName} sur ${data.name} !`}`)
      // Nettoyage de l'URL pour éviter les erreurs de validation Discord (supprime < et >)
      .setURL(live.url.replace(/<|>/g, ''))
      .addFields(
        { name: '🎮 Plateforme', value: `\`${data.name}\``, inline: true },
        { name: '👥 Audience', value: `\`En direct\``, inline: true },
        { name: '🔗 Lien direct', value: `Cliquez ici`, inline: true }
      )
      .setColor(data.color || "#5865F2")
      .setImage(profilePic) // Utilise la photo de profil comme image principale
      .setFooter({ text: `U-Bot System • ${data.name} Notification`, iconURL: data.favicon })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel(`Visualiser le live sur ${data.name}`)
        .setURL(live.url.replace(/<|>/g, '')) // Nettoyage aussi pour le bouton
        .setStyle(ButtonStyle.Link)
    );

    // On met le lien dans le content pour que Discord génère le lecteur automatique
    const content = `${live.roleId ? `<@&${live.roleId}>` : ""}\n🔥 **Alerte Détection :** Un nouveau direct vient de commencer !\n${live.url.replace(/<|>/g, '')}`;
    
    const message = await channel.send({ content, embeds: [embed], components: [row] }).catch(() => null);
    
    if (message) {
      live.isLive = true;
      live.lastMessageId = message.id;
      // No need to call saveUpdate here, checkAllLives will call it once for all changes
    }
  }

  async _fetchChannelInfo(platform, url) {
    let info = { displayName: null, profilePictureUrl: null, liveThumbnailUrl: null };

    try {
      if (platform === 'twitch') {
        const token = await this.getTwitchToken();
        const clientID = process.env.TWITCH_CLIENT_ID;
        if (!token || !clientID) return info;

        const username = url.split('/').pop();
        const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${username}`, {
            headers: { 'Client-ID': clientID, 'Authorization': `Bearer ${token}` }
        });
        const userData = await userRes.json();
        if (userData.data && userData.data.length > 0) {
            info.displayName = userData.data[0].display_name;
            info.profilePictureUrl = userData.data[0].profile_image_url;
            // Pour le thumbnail du live, il faudrait une requête supplémentaire à /helix/streams
        }
      } else if (platform === 'youtube') {
        const apiKey = process.env.YOUTUBE_API_KEY;
        if (!apiKey) return info;

        const handleMatch = url.match(/@([^/?]+)/);
        const channelIdMatch = url.match(/(?:channel\/|user\/|c\/)([a-zA-Z0-9_-]{24}|[a-zA-Z0-9_-]+)/);

        let queryParams = '';
        if (handleMatch) {
            // Pour les handles (@pseudo), on doit d'abord faire une recherche pour obtenir l'ID de chaîne
            const searchRes = await fetch(`https://www.googleapis.com/youtube/v3/search?part=id&q=${handleMatch[1]}&type=channel&key=${apiKey}`);
            const searchData = await searchRes.json();
            if (searchData.items && searchData.items.length > 0) {
                queryParams = `id=${searchData.items[0].id.channelId}`;
            }
        } else if (channelIdMatch) {
            queryParams = `id=${channelIdMatch[1]}`;
        } else {
            // Fallback: on suppose que la dernière partie de l'URL est l'ID de chaîne
            const lastPart = url.split('/').pop();
            if (lastPart) queryParams = `id=${lastPart}`;
        }

        if (!queryParams) return info;

        const channelRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet&${queryParams}&key=${apiKey}`);
        const channelData = await channelRes.json();
        if (channelData.items && channelData.items.length > 0) {
            info.displayName = channelData.items[0].snippet.title;
            info.profilePictureUrl = channelData.items[0].snippet.thumbnails.high.url;
        }
      } else if (platform === 'tiktok') {
        const usernameMatch = url.match(/@([^/?#]+)/);
        const username = usernameMatch ? usernameMatch[1] : url.split('/').pop();
        info.displayName = username;

        try {
          const res = await fetch(`https://www.tiktok.com/@${username}`, {
            headers: { 
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
              'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7'
            }
          });
          if (res.ok) {
            const html = await res.text();
            
            // Tentative 1: Extraction via le script JSON interne de TikTok (très robuste)
            const stateMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([\s\S]*?)<\/script>/);
            if (stateMatch) {
              try {
                const jsonData = JSON.parse(stateMatch[1]);
                const userData = jsonData?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo?.user;
                if (userData) {
                  info.profilePictureUrl = userData.avatarLarger || userData.avatarMedium || userData.avatarThumb;
                  if (userData.nickname) info.displayName = userData.nickname;
                }
              } catch (_) {}
            }

            // Tentative 2: Fallback Regex si le JSON est absent ou incomplet
            if (!info.profilePictureUrl) {
              const jsonAvatar = html.match(/"avatarLarger":"([^"]+)"/) || html.match(/"avatarThumb":"([^"]+)"/);
              if (jsonAvatar) {
                info.profilePictureUrl = jsonAvatar[1].replace(/\\u002F/g, '/');
              } else {
                const ogMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
                if (ogMatch) info.profilePictureUrl = ogMatch[1];
              }
            }
            
            // Extraction du nom d'affichage via le titre de la page
            const titleMatch = html.match(/<title>([^<]+)<\/title>/);
            if (titleMatch) info.displayName = titleMatch[1].split(' | ')[0].trim();
          }
        } catch (e) {}
        
        if (!info.profilePictureUrl) info.profilePictureUrl = `https://www.tiktok.com/favicon.ico`;
      }
    } catch (err) {
      console.error(`❌ Erreur _fetchChannelInfo pour ${platform} (${url}):`, err.message);
    }
    return info;
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