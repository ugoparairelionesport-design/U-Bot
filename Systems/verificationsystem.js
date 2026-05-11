const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const configSystem = require('./configsystem');

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const CHALLENGE_ITEMS = [
  { id: 'shield', emoji: '🛡️', label: 'Bouclier' },
  { id: 'key', emoji: '🗝️', label: 'Cle' },
  { id: 'gem', emoji: '💎', label: 'Cristal' },
  { id: 'compass', emoji: '🧭', label: 'Boussole' },
  { id: 'bolt', emoji: '⚡', label: 'Eclair' },
  { id: 'star', emoji: '⭐', label: 'Etoile' },
  { id: 'lock', emoji: '🔒', label: 'Cadenas' },
  { id: 'spark', emoji: '✨', label: 'Etincelle' }
];

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createNonce() {
  return Math.random().toString(36).slice(2, 10);
}

class VerificationSystem {
  constructor(client) {
    this.client = client;
    this.pendingVerifications = new Map();
    console.log('VerificationSystem initialise');
  }

  getKey(interaction) {
    return `${interaction.guildId}:${interaction.user.id}`;
  }

  async editComponent(interaction, payload) {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate();
      }
      return await interaction.editReply(payload);
    } catch (_) {
      if (interaction.message?.editable) {
        return interaction.message.edit(payload).catch(() => null);
      }
      return null;
    }
  }

  createChallenge(interaction, previousAttempts = 0) {
    const target = CHALLENGE_ITEMS[Math.floor(Math.random() * CHALLENGE_ITEMS.length)];
    const decoys = shuffle(CHALLENGE_ITEMS.filter(item => item.id !== target.id)).slice(0, 4);
    const challenge = {
      nonce: createNonce(),
      target,
      choices: shuffle([target, ...decoys]),
      attempts: previousAttempts,
      expiresAt: Date.now() + CHALLENGE_TTL_MS
    };

    this.pendingVerifications.set(this.getKey(interaction), challenge);
    setTimeout(() => {
      const current = this.pendingVerifications.get(this.getKey(interaction));
      if (current?.nonce === challenge.nonce) this.pendingVerifications.delete(this.getKey(interaction));
    }, CHALLENGE_TTL_MS);

    return challenge;
  }

  buildChallengePayload(interaction, challenge, status = null) {
    const embed = new EmbedBuilder()
      .setTitle('🧩 Verification humaine')
      .setDescription(
        `${status ? `${status}\n\n` : ''}` +
        `### Mini-jeu de securite\n` +
        `Clique sur le symbole correspondant a la cible :\n\n` +
        `## ${challenge.target.emoji} ${challenge.target.label}\n\n` +
        `Tu as 5 minutes pour reussir. Apres 2 mauvais choix, une nouvelle tentative sera demandee.`
      )
      .setColor('#57F287')
      .setThumbnail(interaction.guild?.iconURL({ dynamic: true }) || interaction.client.user.displayAvatarURL())
      .setFooter({ text: `Tentative ${challenge.attempts + 1}/2 • U-Bot Security` })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      challenge.choices.map(item =>
        new ButtonBuilder()
          .setCustomId(`verify_choice_${challenge.nonce}_${item.id}`)
          .setEmoji(item.emoji)
          .setLabel(item.label)
          .setStyle(ButtonStyle.Secondary)
      )
    );

    return { embeds: [embed], components: [row] };
  }

  async handleVerifyButtonClick(interaction) {
    const guildConfig = configSystem.getGuildConfig(interaction.guildId);
    const settings = guildConfig.verification;

    if (!settings?.enabled) {
      return interaction.reply({ content: '❌ Le systeme de verification est actuellement desactive.', flags: 64 }).catch(() => {});
    }

    if (!settings.roleId) {
      return interaction.reply({ content: '❌ Aucun role de verification n est configure.', flags: 64 }).catch(() => {});
    }

    if (interaction.member.roles.cache.has(settings.roleId)) {
      return interaction.reply({ content: '✅ Vous etes deja verifie sur ce serveur.', flags: 64 }).catch(() => {});
    }

    const challenge = this.createChallenge(interaction);
    const payload = this.buildChallengePayload(interaction, challenge);

    if (interaction.customId === 'verify_start') {
      return interaction.reply({ ...payload, flags: 64 }).catch(() => {});
    }

    return this.editComponent(interaction, payload);
  }

  async handleGameChoice(interaction) {
    const [, , nonce, answer] = interaction.customId.split('_');
    const key = this.getKey(interaction);
    const challenge = this.pendingVerifications.get(key);

    if (!challenge || challenge.nonce !== nonce || challenge.expiresAt < Date.now()) {
      this.pendingVerifications.delete(key);
      const expiredEmbed = new EmbedBuilder()
        .setTitle('⏳ Verification expiree')
        .setDescription('La session a expire. Relance le mini-jeu pour obtenir une nouvelle epreuve.')
        .setColor('#FEE75C');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('verify_restart').setLabel('Relancer').setEmoji('🔄').setStyle(ButtonStyle.Primary)
      );
      return this.editComponent(interaction, { embeds: [expiredEmbed], components: [row] });
    }

    if (answer !== challenge.target.id) {
      const attempts = challenge.attempts + 1;
      if (attempts >= 2) {
        this.pendingVerifications.delete(key);
        const failedEmbed = new EmbedBuilder()
          .setTitle('❌ Mauvais choix')
          .setDescription('La verification a echoue. Relance le mini-jeu et prends le temps de choisir la bonne cible.')
          .setColor('#ED4245');
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('verify_restart').setLabel('Reessayer').setEmoji('🔄').setStyle(ButtonStyle.Primary)
        );
        return this.editComponent(interaction, { embeds: [failedEmbed], components: [row] });
      }

      const nextChallenge = this.createChallenge(interaction, attempts);
      return this.editComponent(interaction, this.buildChallengePayload(interaction, nextChallenge, '⚠️ Mauvais symbole. Nouvelle epreuve generee.'));
    }

    const guildConfig = configSystem.getGuildConfig(interaction.guildId);
    const settings = guildConfig.verification;

    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate().catch(() => {});
      }

      const role = await interaction.guild.roles.fetch(settings.roleId);
      if (!role) throw new Error('Role introuvable');

      await interaction.member.roles.add(role, 'Verification humaine reussie');
      this.pendingVerifications.delete(key);

      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Verification reussie')
        .setDescription('Acces valide. Tu peux maintenant profiter du serveur.')
        .setColor('#57F287')
        .setTimestamp();

      await interaction.editReply({ embeds: [successEmbed], components: [] }).catch(() => {});

      const logEmbed = new EmbedBuilder()
        .setTitle('👤 Membre verifie')
        .setDescription(`${interaction.user} a reussi le mini-jeu de verification.`)
        .setColor('#57F287')
        .setTimestamp();

      await configSystem.sendLog(interaction.guild, logEmbed, settings.logChannel);
    } catch (err) {
      console.error('Error verification:', err);
      const errorPayload = {
        content: '❌ Je n ai pas pu attribuer le role. Verifiez mon role et mes permissions.',
        embeds: [],
        components: []
      };

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(errorPayload).catch(() => {});
      } else {
        await interaction.reply({ ...errorPayload, flags: 64 }).catch(() => {});
      }
    }
  }

  async showCodeModal(interaction) {
    return this.handleVerifyButtonClick(interaction);
  }

  async handleModalSubmit(interaction) {
    return interaction.reply({
      content: 'ℹ️ Le captcha par code a ete remplace par le mini-jeu. Clique a nouveau sur le bouton de verification.',
      flags: 64
    }).catch(() => {});
  }
}

module.exports = VerificationSystem;
