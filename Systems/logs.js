const { getGuildConfig } = require('./config');

async function sendLog(guild, message) {
  const config = getGuildConfig(guild.id);
  if (!config.logsChannel) return;

  const channel = guild.channels.cache.get(config.logsChannel);
  if (!channel) return;

  channel.send({ content: message }).catch(() => {});
}

module.exports = { sendLog };