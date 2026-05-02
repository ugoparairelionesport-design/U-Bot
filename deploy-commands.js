const { SlashCommandBuilder, Routes, PermissionFlagsBits } = require('discord.js');
const { REST } = require('@discordjs/rest');
require('dotenv').config();

const commands = [
    // Maintenance
    new SlashCommandBuilder()
        .setName('maintenance')
        .setDescription('Affiche le panneau de maintenance du bot.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    // Protection Hub
    new SlashCommandBuilder()
        .setName('config_protection')
        .setDescription('Ouvre le centre de configuration des modules de protection (Anti-Raid, Anti-Spam, Captcha, DM Lock).')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    // Tickets
    new SlashCommandBuilder()
        .setName('config_ticket')
        .setDescription('Configure le système de tickets (logs, panel, stats).')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('modif_config_ticket')
        .setDescription('Modifie les options existantes du système de tickets.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Affiche les statistiques générales des tickets.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('staff_stats')
        .setDescription('Affiche les statistiques du staff sur les tickets.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    // Live System
    new SlashCommandBuilder()
        .setName('config_live')
        .setDescription('Configure les alertes de live (Twitch, YouTube, TikTok).')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('modif_config_live')
        .setDescription('Modifie ou supprime une configuration de live existante.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('test_live')
        .setDescription('Envoie une notification de live de test.')
        .addStringOption(option =>
            option.setName('plateforme')
                .setDescription('La plateforme du live de test.')
                .setRequired(true)
                .addChoices(
                    { name: 'Twitch', value: 'twitch' },
                    { name: 'YouTube', value: 'youtube' },
                    { name: 'TikTok', value: 'tiktok' }
                ))
        .addStringOption(option =>
            option.setName('url')
                .setDescription('Lien du live de test (ex: https://twitch.tv/test).')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('salon')
                .setDescription('Salon où envoyer la notification de test.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Message personnalisé pour la notification.')
                .setRequired(false))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Rôle à mentionner pour la notification.')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    // Bot Name Customization
    new SlashCommandBuilder()
        .setName('set_config')
        .setDescription('Permet de personnaliser le nom du bot sur ce serveur.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
];

const token = process.env.TOKEN || process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

const rest = new REST({ version: '10' }).setToken(token);

async function deployCommands() {
    if (!token || !clientId) {
        console.error("❌ Erreur : TOKEN ou CLIENT_ID manquant.");
        return;
    }

    try {
        console.log(`🚀 Déploiement [${guildId ? 'GUILD' : 'GLOBAL'}] de ${commands.length} commandes slash...`);
        if (guildId) console.log(`📍 Guild ID cible : ${guildId}`);

        // Déploiement global (peut prendre jusqu'à 1 heure pour apparaître)
        // Ou déploiement spécifique à un GUILD_ID pour un test rapide
        await rest.put(
            guildId ?
                Routes.applicationGuildCommands(clientId, guildId) :
                Routes.applicationCommands(clientId),
            { body: commands },
        );

        console.log(`✅ ${commands.length} commandes slash déployées avec succès !`);
    } catch (error) {
        console.error('❌ Erreur lors du déploiement des commandes slash :', error);
    }
}

module.exports = {
    commands,
    deployCommands
};