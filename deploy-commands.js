const { SlashCommandBuilder, Routes, PermissionFlagsBits } = require('discord.js');
const { REST } = require('@discordjs/rest');
require('dotenv').config();

const commands = [
    new SlashCommandBuilder()
        .setName('config_protection')
        .setDescription('Ouvre le centre de configuration des modules de protection.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('config_ticket')
        .setDescription('Configure le systeme de tickets.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('modif_config_ticket')
        .setDescription('Modifie les options existantes du systeme de tickets.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('config_live')
        .setDescription('Configure les alertes de live.')
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
                .setDescription('Lien du live de test.')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('salon')
                .setDescription('Salon ou envoyer la notification.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Message personnalise.')
                .setRequired(false))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Role a mentionner.')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('set_config')
        .setDescription('Personnalise le nom et les embeds du bot.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('set_logs')
        .setDescription('Configure le systeme de logs detailles.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('set_entrée')
        .setDescription('Configure l accueil, les auto-roles et le reglement.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('set_xp')
        .setDescription('Configure le systeme de niveaux.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('rank')
        .setDescription('Affiche votre carte de niveau ou celle d un membre.')
        .addUserOption(option => option.setName('membre').setDescription('Le membre a afficher')),
    new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Affiche le classement des membres les plus actifs.'),

    new SlashCommandBuilder()
        .setName('set_ia')
        .setDescription('Configure les modules IA et automatisation.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('annonce')
        .setDescription('Cree une annonce stylisee avec l IA.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Affiche la liste des commandes et modules du bot.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
];

const token = process.env.TOKEN || process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const deployGlobal = process.env.DEPLOY_GLOBAL === 'true' || !guildId;
const clearGlobal = process.env.CLEAR_GLOBAL === 'true';
const clearGuild = process.env.CLEAR_GUILD === 'true';

const rest = new REST({ version: '10' }).setToken(token);

async function deployCommands() {
    if (!token || !clientId) {
        console.error('Erreur : TOKEN/DISCORD_TOKEN ou CLIENT_ID manquant.');
        return;
    }

    try {
        if (clearGlobal) {
            console.log('CLEAR : suppression des commandes globales...');
            await rest.put(Routes.applicationCommands(clientId), { body: [] });
            console.log('Commandes globales supprimees. Discord peut mettre jusqu a 1h a les retirer partout.');
        }

        if (clearGuild && guildId) {
            console.log(`CLEAR : suppression des commandes serveur (${guildId})...`);
            await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
            console.log('Commandes serveur supprimees.');
        }

        if (guildId) {
            console.log(`DEPLOY : envoi des commandes au serveur local (instantane: ${guildId})...`);
            await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: commands.map(command => command.toJSON()) }
            );
            console.log('Commandes serveur deployees.');
        }

        if (deployGlobal && !clearGlobal) {
            console.log(`DEPLOY : envoi de ${commands.length} commandes en global...`);
            await rest.put(
                Routes.applicationCommands(clientId),
                { body: commands.map(command => command.toJSON()) }
            );
            console.log('Deploiement global termine. Apparition sous 10-60 min.');
        } else if (guildId) {
            console.log('Deploiement global ignore. Utilisez DEPLOY_GLOBAL=true uniquement pour publier partout.');
        }

        if (require.main === module) {
            setTimeout(() => process.exit(0), 2000);
        }
    } catch (error) {
        console.error('Erreur lors du deploiement des commandes slash :', error);
        if (require.main === module) process.exit(1);
    }
}

if (require.main === module) {
    deployCommands();
}

module.exports = {
    commands,
    deployCommands,
};
