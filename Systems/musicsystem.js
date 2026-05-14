let ffmpegPath = null;
try {
  ffmpegPath = require('ffmpeg-static');
  if (ffmpegPath) process.env.FFMPEG_PATH = ffmpegPath;
} catch (_) {
  console.warn('[MUSIC] ffmpeg-static indisponible. YouTube peut fonctionner, mais les radios/flux directs peuvent etre limites.');
}

const { Readable } = require('stream');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionsBitField
} = require('discord.js');
const {
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus
} = require('@discordjs/voice');
const playdl = require('play-dl');
const { fetch } = require('undici');
const spotifyInfo = require('spotify-url-info')(fetch);
const configSystem = require('./configsystem');

const RADIOS = {
  lofi: {
    name: 'Lo-fi Focus',
    url: 'https://ice2.somafm.com/groovesalad-128-mp3',
    description: 'Ambiance calme pour travailler et discuter.'
  },
  chill: {
    name: 'Chillout',
    url: 'https://ice2.somafm.com/dronezone-128-mp3',
    description: 'Nappes lentes, atmospheres et fond sonore discret.'
  },
  synthwave: {
    name: 'Synthwave',
    url: 'https://ice2.somafm.com/defcon-128-mp3',
    description: 'Ambiance electronique sombre et energique.'
  },
  jazz: {
    name: 'Jazz',
    url: 'https://ice2.somafm.com/sonicuniverse-128-mp3',
    description: 'Jazz moderne et textures instrumentales.'
  }
};

class MusicSystem {
  constructor(client) {
    this.client = client;
    this.states = new Map();
    this.spotifyTokenConfigured = false;
    console.log('MusicSystem initialise');
  }

  getSettings(guildId) {
    const guildConfig = configSystem.getGuildConfig(guildId);
    return guildConfig.music;
  }

  getState(guildId) {
    if (!this.states.has(guildId)) {
      const player = createAudioPlayer({
        behaviors: { noSubscriber: NoSubscriberBehavior.Play }
      });

      const state = {
        guildId,
        player,
        connection: null,
        queue: [],
        current: null,
        resource: null,
        volume: this.getSettings(guildId).defaultVolume || 70,
        textChannelId: null,
        voiceChannelId: null,
        nowChannelId: null,
        nowMessageId: null,
        startedAt: null,
        votes: new Set(),
        history: new Set()
      };

      player.on(AudioPlayerStatus.Idle, async () => {
        await this.finishNowMessage(state, 'Titre termine').catch(() => {});
        state.current = null;
        state.resource = null;
        state.startedAt = null;
        state.votes.clear();
        this.playNext(guildId).catch(err => console.error('[MUSIC] playNext:', err.message));
      });

      player.on('error', async err => {
        console.error('[MUSIC] Player error:', err.message);
        await this.notifyPlaybackFailure(state, err).catch(() => {});
        await this.finishNowMessage(state, 'Lecture interrompue').catch(() => {});
        state.current = null;
        state.resource = null;
        state.startedAt = null;
        state.votes.clear();
        this.playNext(guildId).catch(error => console.error('[MUSIC] recovery:', error.message));
      });

      this.states.set(guildId, state);
    }

    return this.states.get(guildId);
  }

  memberHasDj(member, settings) {
    if (!member) return false;
    if (member.permissions?.has(PermissionsBitField.Flags.Administrator)) return true;
    if (member.permissions?.has(PermissionsBitField.Flags.ManageGuild)) return true;
    return Boolean(settings.djRoleId && member.roles?.cache?.has(settings.djRoleId));
  }

  canControl(member, settings, current) {
    if (this.memberHasDj(member, settings)) return true;
    return Boolean(current?.requestedById && current.requestedById === member?.id);
  }

  async ensureVoice(interaction) {
    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      throw new Error('Tu dois etre connecte dans un salon vocal.');
    }

    const me = await interaction.guild.members.fetchMe().catch(() => null);
    const permissions = me ? voiceChannel.permissionsFor(me) : null;
    if (!permissions?.has(PermissionsBitField.Flags.Connect) || !permissions?.has(PermissionsBitField.Flags.Speak)) {
      throw new Error('Il me manque les permissions Connecter/Parler dans ton salon vocal.');
    }

    const state = this.getState(interaction.guildId);
    state.textChannelId = interaction.channelId;
    state.voiceChannelId = voiceChannel.id;

    if (state.connection && state.connection.joinConfig.channelId === voiceChannel.id) {
      return state;
    }

    const previous = getVoiceConnection(interaction.guildId);
    if (previous && previous.joinConfig.channelId !== voiceChannel.id) previous.destroy();

    state.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: interaction.guildId,
      adapterCreator: interaction.guild.voiceAdapterCreator,
      selfDeaf: true
    });

    state.connection.subscribe(state.player);
    state.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(state.connection, VoiceConnectionStatus.Signalling, 5000),
          entersState(state.connection, VoiceConnectionStatus.Connecting, 5000)
        ]);
      } catch (_) {
        this.destroyState(interaction.guildId);
      }
    });

    return state;
  }

  destroyState(guildId) {
    const state = this.states.get(guildId);
    if (!state) return;
    state.queue = [];
    state.current = null;
    state.votes.clear();
    this.finishNowMessage(state, 'Lecture stoppee').catch(() => {});
    state.player.stop(true);
    state.connection?.destroy();
    this.states.delete(guildId);
  }

  async handleCommand(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const settings = this.getSettings(interaction.guildId);

    if (!settings.enabled && subcommand !== 'queue') {
      return interaction.reply({
        content: 'Le module musique est desactive. Lance /config_musique pour l activer.',
        flags: 64
      });
    }

    if (['play', 'radio', 'skip', 'stop', 'pause', 'resume', 'volume', 'now', 'lyrics'].includes(subcommand)) {
      await interaction.deferReply({ flags: 64 });
    }

    try {
      switch (subcommand) {
        case 'play':
          return await this.handlePlay(interaction, settings);
        case 'radio':
          return await this.handleRadio(interaction, settings);
        case 'queue':
          return await this.handleQueue(interaction);
        case 'skip':
          return await this.handleSkip(interaction, settings);
        case 'stop':
          return await this.handleStop(interaction, settings);
        case 'pause':
          return await this.handlePause(interaction, settings);
        case 'resume':
          return await this.handleResume(interaction, settings);
        case 'volume':
          return await this.handleVolume(interaction, settings);
        case 'now':
          return await this.handleNow(interaction);
        case 'lyrics':
          return await this.handleLyrics(interaction, settings);
        default:
          return interaction.reply({ content: 'Commande musique inconnue.', flags: 64 });
      }
    } catch (err) {
      const content = this.formatUserError(err);
      if (interaction.deferred || interaction.replied) return interaction.editReply({ content });
      return interaction.reply({ content, flags: 64 });
    }
  }

  async handleButton(interaction) {
    const settings = this.getSettings(interaction.guildId);
    const state = this.states.get(interaction.guildId);
    if (!state) return interaction.reply({ content: 'Aucune lecture en cours.', flags: 64 });

    await interaction.deferReply({ flags: 64 }).catch(() => {});
    const action = interaction.customId.replace('music_player_', '');

    if (action === 'queue') return interaction.editReply(await this.buildQueuePayload(interaction.guild));
    if (action === 'pause') return this.handlePause(interaction, settings);
    if (action === 'resume') return this.handleResume(interaction, settings);
    if (action === 'skip') return this.handleSkip(interaction, settings);
    if (action === 'stop') return this.handleStop(interaction, settings);
    return interaction.editReply({ content: 'Action musique inconnue.' });
  }

  async handlePlay(interaction, settings) {
    const query = interaction.options.getString('requete', true);
    const state = await this.ensureVoice(interaction);
    const remainingSlots = Math.max(1, (settings.maxQueue || 50) - state.queue.length);
    const tracks = await this.resolveMany(query, interaction.user, settings, remainingSlots);
    if (!tracks.length) throw new Error('Aucun titre lisible trouve.');

    state.queue.push(...tracks);
    const started = await this.startIfIdle(interaction.guildId);
    const label = tracks.length === 1 ? tracks[0].title : `${tracks.length} titres ajoutes`;
    return interaction.editReply({
      content: `${started ? 'Lecture lancee' : 'Ajoute a la file'} : **${this.shorten(label, 90)}**`
    });
  }

  async handleRadio(interaction, settings) {
    if (!settings.allowRadio) throw new Error('Les radios sont desactivees dans /config_musique.');
    const ambiance = interaction.options.getString('ambiance', true);
    const radio = RADIOS[ambiance];
    if (!radio) throw new Error('Radio inconnue.');

    const state = await this.ensureVoice(interaction);
    state.queue.push({
      title: radio.name,
      url: radio.url,
      duration: 0,
      thumbnail: null,
      source: 'radio',
      isRadio: true,
      requestedById: interaction.user.id,
      requestedByName: interaction.user.username
    });

    const started = await this.startIfIdle(interaction.guildId);
    return interaction.editReply({
      content: `${started ? 'Radio lancee' : 'Radio ajoutee'} : **${radio.name}** - ${radio.description}`
    });
  }

  async handleQueue(interaction) {
    const payload = await this.buildQueuePayload(interaction.guild);
    if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
    return interaction.reply({ ...payload, flags: 64 });
  }

  async handleSkip(interaction, settings) {
    const state = this.states.get(interaction.guildId);
    if (!state?.current) return interaction.editReply({ content: 'Aucun titre en cours.' });

    if (this.canControl(interaction.member, settings, state.current) || !settings.voteSkip) {
      state.player.stop(true);
      return interaction.editReply({ content: 'Titre passe.' });
    }

    const voiceChannel = interaction.member?.voice?.channel;
    const listeners = voiceChannel?.members?.filter(member => !member.user.bot).size || 1;
    const required = Math.max(1, Math.ceil(listeners * (settings.voteSkipRatio || 0.5)));
    state.votes.add(interaction.user.id);

    if (state.votes.size >= required) {
      state.player.stop(true);
      return interaction.editReply({ content: `Vote skip valide (${state.votes.size}/${required}). Titre passe.` });
    }

    return interaction.editReply({ content: `Vote skip ajoute : ${state.votes.size}/${required}.` });
  }

  async handleStop(interaction, settings) {
    const state = this.states.get(interaction.guildId);
    if (!state) return interaction.editReply({ content: 'Aucune lecture en cours.' });
    if (!this.canControl(interaction.member, settings, state.current)) {
      return interaction.editReply({ content: 'Action reservee au DJ, au staff ou au demandeur du titre.' });
    }

    this.destroyState(interaction.guildId);
    return interaction.editReply({ content: 'Lecture stoppee et file videe.' });
  }

  async handlePause(interaction, settings) {
    const state = this.states.get(interaction.guildId);
    if (!state?.current) return interaction.editReply({ content: 'Aucune lecture en cours.' });
    if (!this.canControl(interaction.member, settings, state.current)) {
      return interaction.editReply({ content: 'Action reservee au DJ, au staff ou au demandeur du titre.' });
    }
    state.player.pause(true);
    return interaction.editReply({ content: 'Lecture mise en pause.' });
  }

  async handleResume(interaction, settings) {
    const state = this.states.get(interaction.guildId);
    if (!state?.current) return interaction.editReply({ content: 'Aucune lecture en cours.' });
    if (!this.canControl(interaction.member, settings, state.current)) {
      return interaction.editReply({ content: 'Action reservee au DJ, au staff ou au demandeur du titre.' });
    }
    state.player.unpause();
    return interaction.editReply({ content: 'Lecture reprise.' });
  }

  async handleVolume(interaction, settings) {
    const state = this.states.get(interaction.guildId);
    if (!state) return interaction.editReply({ content: 'Aucune lecture en cours.' });
    if (!this.memberHasDj(interaction.member, settings)) {
      return interaction.editReply({ content: 'Le volume serveur est reserve au DJ ou au staff.' });
    }

    const volume = Math.max(1, Math.min(150, interaction.options.getInteger('niveau', true)));
    state.volume = volume;
    if (state.resource?.volume) state.resource.volume.setVolume(volume / 100);
    return interaction.editReply({ content: `Volume serveur regle sur ${volume}%.` });
  }

  async handleNow(interaction) {
    const state = this.states.get(interaction.guildId);
    if (!state?.current) return interaction.editReply({ content: 'Aucun titre en cours.' });
    return interaction.editReply(await this.buildNowPayload(interaction.guild, state.current, true));
  }

  async handleLyrics(interaction, settings) {
    if (!settings.lyrics) return interaction.editReply({ content: 'Les lyrics sont desactives dans /config_musique.' });
    const query = interaction.options.getString('requete') || this.states.get(interaction.guildId)?.current?.title;
    if (!query) return interaction.editReply({ content: 'Aucun titre en cours. Ajoute une recherche.' });

    const url = `https://genius.com/search?q=${encodeURIComponent(query)}`;
    return interaction.editReply({ content: `Recherche lyrics : ${url}` });
  }

  async startIfIdle(guildId) {
    const state = this.getState(guildId);
    if (state.current || state.player.state.status === AudioPlayerStatus.Playing || state.player.state.status === AudioPlayerStatus.Buffering) {
      return false;
    }
    await this.playNext(guildId);
    return true;
  }

  async playNext(guildId) {
    const state = this.states.get(guildId);
    if (!state) return;

    if (!state.queue.length) {
      await this.tryAutoplay(state);
    }

    const track = state.queue.shift();
    if (!track) return;

    try {
      const resource = await this.createResource(track, state.volume);
      state.current = track;
      state.resource = resource;
      state.startedAt = Date.now();
      state.history.add(track.url);
      state.player.play(resource);
      await this.sendNowPlaying(state, track);
    } catch (err) {
      console.error('[MUSIC] Resource error:', err.message);
      await this.notifyPlaybackFailure(state, err, track).catch(() => {});
      state.current = null;
      state.resource = null;
      state.startedAt = null;
      await this.playNext(guildId);
    }
  }

  async tryAutoplay(state) {
    const settings = this.getSettings(state.guildId);
    if (!settings.autoplay || !state.current || state.current.source !== 'youtube') return;
    if (!settings.allowYouTube) return;

    const results = await playdl.search(`${state.current.title} mix`, {
      limit: 5,
      source: { youtube: 'video' }
    }).catch(() => []);

    const next = results.find(video => video?.url && !state.history.has(video.url));
    if (!next) return;
    state.queue.push(this.videoToTrack(next, {
      id: this.client.user.id,
      username: 'Autoplay'
    }));
  }

  async createResource(track, volume) {
    let resource;

    if (track.source === 'youtube') {
      const stream = await playdl.stream(track.url, { discordPlayerCompatibility: true });
      resource = createAudioResource(stream.stream, {
        inputType: stream.type,
        inlineVolume: true
      });
    } else {
      const response = await fetch(track.url, {
        headers: { 'User-Agent': 'U-Bot-Music/1.0' }
      });
      if (!response.ok || !response.body) throw new Error(`Flux indisponible (${response.status}).`);
      const nodeStream = Readable.fromWeb(response.body);
      resource = createAudioResource(nodeStream, {
        inputType: StreamType.Arbitrary,
        inlineVolume: true
      });
    }

    resource.volume?.setVolume((volume || 70) / 100);
    return resource;
  }

  async resolveMany(input, user, settings, limit = 1) {
    const query = String(input || '').trim();
    if (!query) return [];

    if (this.isDirectAudioUrl(query)) {
      return [{
        title: 'Flux audio direct',
        url: query,
        duration: 0,
        thumbnail: null,
        source: 'stream',
        requestedById: user.id,
        requestedByName: user.username
      }];
    }

    if (this.isSpotifyUrl(query)) {
      if (!settings.allowSpotify) throw new Error('Spotify est desactive dans /config_musique.');
      return this.resolveSpotify(query, user, settings, limit);
    }

    const playlistId = this.extractYouTubePlaylistId(query);
    if (playlistId) {
      if (!settings.allowYouTube) throw new Error('YouTube est desactive dans /config_musique.');
      return this.resolveYouTubePlaylist(query, user, limit);
    }

    const ytType = playdl.yt_validate(query);
    if (ytType) {
      if (!settings.allowYouTube) throw new Error('YouTube est desactive dans /config_musique.');

      if (ytType === 'playlist') {
        return this.resolveYouTubePlaylist(query, user, limit);
      }

      const info = await playdl.video_info(query);
      return [this.videoToTrack(info.video_details, user)];
    }

    if (!settings.allowYouTube) throw new Error('La recherche YouTube est desactivee.');
    const results = await playdl.search(query, {
      limit: 1,
      source: { youtube: 'video' }
    });
    return results.slice(0, 1).map(video => this.videoToTrack(video, user));
  }

  async resolveYouTubePlaylist(input, user, limit) {
    const playlistId = this.extractYouTubePlaylistId(input);
    if (!playlistId) throw new Error('Playlist YouTube invalide.');

    const apiKey = process.env.YOUTUBE_API_KEY;
    if (apiKey) {
      const tracks = await this.resolveYouTubePlaylistWithApi(playlistId, user, limit);
      if (tracks.length) return tracks;
    }

    try {
      const playlist = await playdl.playlist_info(input, { incomplete: true });
      const videos = await playlist.all_videos();
      return videos
        .filter(video => video?.url && video?.title)
        .slice(0, limit)
        .map(video => this.videoToTrack(video, user));
    } catch (err) {
      throw new Error('Playlist YouTube indisponible. Configure YOUTUBE_API_KEY dans les variables Discloud pour une lecture fiable des playlists.');
    }
  }

  async resolveYouTubePlaylistWithApi(playlistId, user, limit) {
    const apiKey = process.env.YOUTUBE_API_KEY;
    const tracks = [];
    let pageToken = '';

    while (tracks.length < limit) {
      const params = new URLSearchParams({
        part: 'snippet,contentDetails',
        maxResults: String(Math.min(50, Math.max(1, limit - tracks.length))),
        playlistId,
        key: apiKey
      });
      if (pageToken) params.set('pageToken', pageToken);

      const response = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const message = data?.error?.message || `HTTP ${response.status}`;
        throw new Error(`Playlist YouTube API indisponible : ${message}`);
      }

      for (const item of data.items || []) {
        const videoId = item.contentDetails?.videoId;
        const title = item.snippet?.title;
        if (!videoId || !title || /^Deleted video|Private video$/i.test(title)) continue;

        const thumbnailSet = item.snippet?.thumbnails || {};
        const thumbnail = thumbnailSet.maxres?.url ||
          thumbnailSet.standard?.url ||
          thumbnailSet.high?.url ||
          thumbnailSet.medium?.url ||
          thumbnailSet.default?.url ||
          null;

        tracks.push({
          title,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          duration: 0,
          thumbnail,
          source: 'youtube',
          sourceLabel: 'YouTube Playlist',
          requestedById: user.id,
          requestedByName: user.username,
          videoId
        });

        if (tracks.length >= limit) break;
      }

      pageToken = data.nextPageToken || '';
      if (!pageToken) break;
    }

    await this.applyYouTubeDurations(tracks);
    return tracks;
  }

  async applyYouTubeDurations(tracks) {
    const apiKey = process.env.YOUTUBE_API_KEY;
    const ids = tracks.map(track => track.videoId).filter(Boolean);
    if (!apiKey || !ids.length) return;

    const durations = new Map();
    for (let index = 0; index < ids.length; index += 50) {
      const params = new URLSearchParams({
        part: 'contentDetails',
        id: ids.slice(index, index + 50).join(','),
        key: apiKey
      });
      const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params.toString()}`).catch(() => null);
      const data = response?.ok ? await response.json().catch(() => null) : null;
      for (const item of data?.items || []) {
        durations.set(item.id, this.parseIsoDuration(item.contentDetails?.duration));
      }
    }

    for (const track of tracks) {
      if (durations.has(track.videoId)) track.duration = durations.get(track.videoId);
      delete track.videoId;
    }
  }

  async resolveSpotify(url, user, settings, limit) {
    if (!settings.allowYouTube) throw new Error('Spotify utilise YouTube comme source audio. Active YouTube.');

    let tracks = [];
    try {
      tracks = await spotifyInfo.getTracks(url);
    } catch (_) {
      await this.configureSpotifyToken().catch(() => {});
      const spotify = await playdl.spotify(url);

      if (spotify.type === 'track') {
        tracks.push(spotify);
      } else if (typeof spotify.fetch === 'function') {
        const fetched = await spotify.fetch();
        const maps = fetched?.fetched_tracks ? Array.from(fetched.fetched_tracks.values()).flat() : [];
        if (Array.isArray(fetched?.tracks)) tracks.push(...fetched.tracks);
        tracks.push(...maps);
      }
    }

    if (!tracks.length) throw new Error('Lien Spotify non resolu.');

    const resolved = [];
    for (const track of tracks.slice(0, limit)) {
      const artists = Array.isArray(track.artists)
        ? track.artists.map(artist => artist.name || artist).join(' ')
        : (track.artist || track.artists || '');
      const search = `${track.name || track.title || ''} ${artists}`.trim();
      if (!search) continue;
      const videos = await playdl.search(search, { limit: 1, source: { youtube: 'video' } }).catch(() => []);
      if (videos[0]) {
        const resolvedTrack = this.videoToTrack(videos[0], user);
        resolvedTrack.sourceLabel = 'Spotify -> YouTube';
        resolved.push(resolvedTrack);
      }
    }

    return resolved;
  }

  async configureSpotifyToken() {
    if (this.spotifyTokenConfigured) return;

    const client_id = process.env.SPOTIFY_CLIENT_ID;
    const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
    const refresh_token = process.env.SPOTIFY_REFRESH_TOKEN;

    if (!client_id || !client_secret || !refresh_token) return;
    await playdl.setToken({
      spotify: {
        client_id,
        client_secret,
        refresh_token,
        market: process.env.SPOTIFY_MARKET || 'FR'
      }
    });
    this.spotifyTokenConfigured = true;
  }

  videoToTrack(video, user) {
    const thumbnails = video.thumbnails || video.thumbnail ? (video.thumbnails || [video.thumbnail]) : [];
    const thumbnail = Array.isArray(thumbnails) && thumbnails.length ? thumbnails[thumbnails.length - 1]?.url : null;
    return {
      title: video.title || video.name || 'Titre inconnu',
      url: video.url,
      duration: video.durationInSec || video.duration || 0,
      thumbnail,
      source: 'youtube',
      requestedById: user.id,
      requestedByName: user.username
    };
  }

  async sendNowPlaying(state, track) {
    const guild = this.client.guilds.cache.get(state.guildId);
    if (!guild) return;
    const payload = await this.buildNowPayload(guild, track, false);
    const settings = this.getSettings(state.guildId);
    const channelId = settings.announceChannelId || state.textChannelId;
    const channel = channelId ? await guild.channels.fetch(channelId).catch(() => null) : null;
    if (channel?.isTextBased()) {
      const message = await channel.send(payload).catch(() => null);
      if (message) {
        state.nowChannelId = channel.id;
        state.nowMessageId = message.id;
      }
    }
  }

  async buildNowPayload(guild, track, ephemeral = false) {
    const guildConfig = configSystem.getGuildConfig(guild.id);
    const state = this.states.get(guild.id);
    const queueCount = state?.queue?.length || 0;
    const voteText = state?.votes?.size ? `${state.votes.size} vote(s)` : 'Aucun vote';
    const elapsed = state?.startedAt ? Math.floor((Date.now() - state.startedAt) / 1000) : 0;
    const progress = this.buildProgressLine(track, elapsed);
    const voiceText = state?.voiceChannelId ? `<#${state.voiceChannelId}>` : '`Non connecte`';

    const embed = new EmbedBuilder()
      .setTitle('U-BOT | Now Playing')
      .setDescription(
        `**${this.shorten(track.title, 180)}**\n` +
        `${progress}`
      )
      .addFields(
        { name: 'Source', value: `\`${track.sourceLabel || track.source}\``, inline: true },
        { name: 'Salon vocal', value: voiceText, inline: true },
        { name: 'Queue', value: `\`${queueCount} en attente\``, inline: true },
        { name: 'Demande par', value: `\`${track.requestedByName || 'Inconnu'}\``, inline: true },
        { name: 'Votes skip', value: `\`${voteText}\``, inline: true },
        { name: 'Volume', value: `\`${state?.volume || 70}%\``, inline: true }
      )
      .setURL(track.url)
      .setColor(guildConfig.globalEmbedColor)
      .setThumbnail(track.thumbnail || guild.client.user.displayAvatarURL())
      .setImage(guildConfig.globalEmbedBanner)
      .setFooter({ text: 'U-Bot Music - boutons actifs sur la lecture en cours' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('music_player_pause').setLabel('Pause').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('music_player_resume').setLabel('Reprendre').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('music_player_skip').setLabel('Skip').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('music_player_queue').setLabel('Queue').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('music_player_stop').setLabel('Stop').setStyle(ButtonStyle.Danger)
    );

    const payload = {
      embeds: [embed],
      components: [row]
    };
    if (ephemeral) payload.flags = 64;

    return configSystem.withGuildBanner(guildConfig, payload, 'music-now-banner');
  }

  async buildQueuePayload(guild) {
    const guildConfig = configSystem.getGuildConfig(guild.id);
    const state = this.states.get(guild.id);
    const lines = [];

    const totalDuration = this.getQueueDuration(state?.queue || []);

    if (state?.current) {
      lines.push(`**En cours**\n${this.shorten(state.current.title, 90)}`);
    } else {
      lines.push('Aucune lecture en cours.');
    }

    if (state?.queue?.length) {
      lines.push('');
      lines.push(`**A suivre** - ${state.queue.length} titre(s), ${totalDuration}`);
      lines.push(...state.queue.slice(0, 10).map((track, index) =>
        `**${index + 1}.** ${this.shorten(track.title, 70)} - \`${track.isRadio ? 'radio' : this.formatDuration(track.duration)}\``
      ));
      if (state.queue.length > 10) lines.push(`... +${state.queue.length - 10} titre(s)`);
    }

    const embed = new EmbedBuilder()
      .setTitle('U-BOT | Queue Musique')
      .setDescription(lines.join('\n'))
      .addFields(
        { name: 'Volume', value: `\`${state?.volume || 70}%\``, inline: true },
        { name: 'Salon vocal', value: state?.voiceChannelId ? `<#${state.voiceChannelId}>` : '`Non connecte`', inline: true },
        { name: 'Mode', value: `\`${state?.current?.isRadio ? 'Radio' : 'Lecture'}\``, inline: true }
      )
      .setColor(guildConfig.globalEmbedColor)
      .setThumbnail(guild.client.user.displayAvatarURL())
      .setImage(guildConfig.globalEmbedBanner)
      .setFooter({ text: `${state?.queue?.length || 0} titre(s) en attente` })
      .setTimestamp();

    return configSystem.withGuildBanner(guildConfig, { embeds: [embed] }, 'music-queue-banner');
  }

  isDirectAudioUrl(value) {
    return /^https?:\/\//i.test(value) &&
      !/youtube\.com|youtu\.be|spotify\.com/i.test(value) &&
      /\.(mp3|aac|ogg|wav|flac|m3u8)(\?|$)/i.test(value);
  }

  isSpotifyUrl(value) {
    return /^https?:\/\/open\.spotify\.com\//i.test(value);
  }

  extractYouTubePlaylistId(value) {
    const text = String(value || '').trim();
    if (/^(PL|UU|LL|RD|OL)[a-zA-Z0-9_-]{10,}$/i.test(text)) return text;

    try {
      const parsed = new URL(text);
      if (!/(^|\.)youtube\.com$/i.test(parsed.hostname) && !/(^|\.)youtu\.be$/i.test(parsed.hostname)) return null;
      const list = parsed.searchParams.get('list');
      return /^(PL|UU|LL|RD|OL)[a-zA-Z0-9_-]{10,}$/i.test(list || '') ? list : null;
    } catch (_) {
      return null;
    }
  }

  parseIsoDuration(value) {
    const match = String(value || '').match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
    if (!match) return 0;
    return (Number(match[1] || 0) * 3600) + (Number(match[2] || 0) * 60) + Number(match[3] || 0);
  }

  formatDuration(seconds) {
    if (!seconds) return 'Live';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const hours = Math.floor(mins / 60);
    if (hours > 0) return `${hours}:${String(mins % 60).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }

  buildProgressLine(track, elapsed) {
    if (track.isRadio || !track.duration) return '`Radio continue`';
    const current = Math.max(0, Math.min(track.duration, elapsed || 0));
    const ratio = track.duration > 0 ? current / track.duration : 0;
    const filled = Math.round(ratio * 14);
    const bar = '#'.repeat(filled) + '-'.repeat(14 - filled);
    return `\`${this.formatDuration(current)} ${bar} ${this.formatDuration(track.duration)}\``;
  }

  getQueueDuration(queue) {
    const finite = queue.filter(track => !track.isRadio && track.duration);
    if (!finite.length) return 'duree variable';
    return this.formatDuration(finite.reduce((total, track) => total + Number(track.duration || 0), 0));
  }

  async finishNowMessage(state, label) {
    if (!state?.nowChannelId || !state?.nowMessageId) return;
    const guild = this.client.guilds.cache.get(state.guildId);
    const channel = guild ? await guild.channels.fetch(state.nowChannelId).catch(() => null) : null;
    const message = channel?.isTextBased()
      ? await channel.messages.fetch(state.nowMessageId).catch(() => null)
      : null;

    if (message?.editable && message.embeds?.length) {
      const embeds = message.embeds.map(embed =>
        EmbedBuilder.from(embed.toJSON()).setFooter({ text: `U-Bot Music - ${label}` })
      );
      await message.edit({ embeds, components: [] }).catch(() => {});
    }

    state.nowChannelId = null;
    state.nowMessageId = null;
  }

  async notifyPlaybackFailure(state, err, track = null) {
    const guild = this.client.guilds.cache.get(state.guildId);
    const channelId = state.textChannelId || state.nowChannelId;
    const channel = guild && channelId ? await guild.channels.fetch(channelId).catch(() => null) : null;
    if (!channel?.isTextBased()) return;

    const title = track?.title ? `**${this.shorten(track.title, 90)}**` : 'le titre en cours';
    await channel.send({
      content: `Lecture impossible pour ${title}. Passage au titre suivant si la queue contient encore de la musique.`
    }).then(message => {
      setTimeout(() => message.delete().catch(() => {}), 12000);
    }).catch(() => {});
  }

  formatUserError(err) {
    const raw = String(err?.message || err || 'Erreur inconnue');
    if (/YouTube|Captcha|bot|unusual traffic|playability|private|unavailable|Sign in/i.test(raw)) {
      return 'Erreur musique : cette source est bloquee ou indisponible. Essaie un autre lien, une recherche texte ou une radio.';
    }
    if (/ffmpeg|Flux|stream|403|404|410|429/i.test(raw)) {
      return 'Erreur musique : le flux audio est indisponible pour le moment. Essaie une autre source.';
    }
    return `Erreur musique : ${raw}`;
  }

  shorten(text, max) {
    const clean = String(text || '');
    return clean.length > max ? `${clean.slice(0, max - 1)}...` : clean;
  }
}

MusicSystem.RADIOS = RADIOS;

module.exports = MusicSystem;
