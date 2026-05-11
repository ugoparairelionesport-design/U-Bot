const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const configSystem = require('./configsystem');

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const CHALLENGE_ITEMS = [
  { id: 'shield', emoji: '🛡️', label: 'Bouclier' },
  { id: 'key', emoji: '🗝️', label: 'Clé' },
  { id: 'gem', emoji: '💎', label: 'Cristal' },
  { id: 'compass', emoji: '🧭', label: 'Boussole' },
  { id: 'bolt', emoji: '⚡', label: 'Éclair' },
  { id: 'star', emoji: '⭐', label: 'Étoile' },
  { id: 'lock', emoji: '🔒', label: 'Cadenas' },
  { id: 'spark', emoji: '✨', label: 'Étincelle' }
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
    console.log('🤖 Système de Vérification Humaine initialisé');
  }

  getKey(interaction) {
    return `${interaction.guildId}:${interaction.user.id}`;
  }

  createChallenge(interaction, previousAttempts = 0) {
    const target = CHALLENGE_ITEMS[Math.floor(Math.random() * CHALLENGE_ITEMS.length)];
    const decoys = shuffle(CHALLENGE_ITEMS.filter(item => item.id !== target.id)).slice(0, 4);
    const choices = shuffle([target, ...decoys]);
    const challenge = {
      nonce: createNonce(),
      target,
      choices,
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
      .setTitle('🧩 Vérification Humaine')
      .setDescription(
        `${status ? `${status}\n\n` : ''}` +
        `### Mini-jeu de sécurité\n` +
        `Clique sur le symbole correspondant à la cible :\n\n` +
        `## ${challenge.target.emoji} ${challenge.target.label}\n\n` +
        `Tu as 5 minutes pour réussir. Après 2 mauvais choix, une nouvelle tentative sera demandée.`
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
      return interaction.reply({ content: '❌ Le système de vérification est actuellement désactivé.', flags: 64 });
    }

    if (!settings.roleId) {
      return interaction.reply({ content: '❌ Aucun rôle de vérification n’est configuré.', flags: 64 });
    }

    if (interaction.member.roles.cache.has(settings.roleId)) {
      return interaction.reply({ content: '✅ Vous êtes déjà vérifié sur ce serveur.', flags: 64 });
    }

    const challenge = this.createChallenge(interaction);
    const payload = this.buildChallengePayload(interaction, challenge);

    if (interaction.customId === 'verify_start') {
      return interaction.reply({ ...payload, flags: 64 });
    }

    return interaction.update(payload).catch(() => interaction.reply({ ...payload, flags: 64 }));
  }

  async handleGameChoice(interaction) {
    const [, , nonce, answer] = interaction.customId.split('_');
    const key = this.getKey(interaction);
    const challenge = this.pendingVerifications.get(key);

    if (!challenge || challenge.nonce !== nonce || challenge.expiresAt < Date.now()) {
      this.pendingVerifications.delete(key);
      const expiredEmbed = new EmbedBuilder()
        .setTitle('⏳ Vérification expirée')
        .setDescription('La session de vérification a expiré. Relance le mini-jeu pour obtenir une nouvelle épreuve.')
        .setColor('#FEE75C');
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('verify_restart').setLabel('Relancer').setEmoji('🔄').setStyle(ButtonStyle.Primary)
      );
      return interaction.update({ embeds: [expiredEmbed], components: [row] }).catch(() => {});
    }

    if (answer !== challenge.target.id) {
      const attempts = challenge.attempts + 1;
      if (attempts >= 2) {
        this.pendingVerifications.delete(key);
        const failedEmbed = new EmbedBuilder()
          .setTitle('❌ Mauvais choix')
          .setDescription('La vérification a échoué. Relance le mini-jeu et prends le temps de choisir la bonne cible.')
          .setColor('#ED4245');
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('verify_restart').setLabel('Réessayer').setEmoji('🔄').setStyle(ButtonStyle.Primary)
        );
        return interaction.update({ embeds: [failedEmbed], components: [row] }).catch(() => {});
      }

      const nextChallenge = this.createChallenge(interaction, attempts);
      return interaction.update(this.buildChallengePayload(interaction, nextChallenge, '⚠️ Mauvais symbole. Nouvelle épreuve générée.')).catch(() => {});
    }

    const guildConfig = configSystem.getGuildConfig(interaction.guildId);
    const settings = guildConfig.verification;

    try {
      const role = await interaction.guild.roles.fetch(settings.roleId);
      if (!role) throw new Error('Rôle introuvable');

      await interaction.member.roles.add(role, 'Vérification humaine réussie');
      this.pendingVerifications.delete(key);

      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Vérification réussie')
        .setDescription('Accès validé. Tu peux maintenant profiter du serveur.')
        .setColor('#57F287')
        .setTimestamp();

      await interaction.update({ embeds: [successEmbed], components: [] });

      const logEmbed = new EmbedBuilder()
        .setTitle('👤 Membre Vérifié')
        .setDescription(`${interaction.user} a réussi le mini-jeu de vérification.`)
        .setColor('#57F287')
        .setTimestamp();

      await configSystem.sendLog(interaction.guild, logEmbed, settings.logChannel);
    } catch (err) {
      console.error('❌ Error verification:', err);
      await interaction.reply({ content: '❌ Je n’ai pas pu attribuer le rôle. Vérifiez mon rôle et mes permissions.', flags: 64 }).catch(() => {});
    }
  }

  async showCodeModal(interaction) {
    return this.handleVerifyButtonClick(interaction);
  }

  async handleModalSubmit(interaction) {
    return interaction.reply({ content: 'ℹ️ Le captcha par code a été remplacé par le mini-jeu. Clique à nouveau sur le bouton de vérification.', flags: 64 });
  }
}

module.exports = VerificationSystem;
