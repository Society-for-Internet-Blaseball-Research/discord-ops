require('dotenv').config();

const chalk = require('chalk');
const Discord = require('discord.js');

const client = new Discord.Client();

function comparePermissionOverwrites(guild) {
  return (a, b) => {
    if (a.type === 'role') {
      const aRole = guild.roles.cache.get(a.id);
      if (b.type === 'role') {
        const bRole = guild.roles.cache.get(b.id);
        return bRole.rawPosition - aRole.rawPosition;
      } if (b.type === 'member') {
        return -1;
      }
    } else if (a.type === 'role') {
      return 1;
    }
    return 0;
  };
}

async function logOverwrites(guild, perms) {
  const permsSorted = [...perms.values()];
  permsSorted.sort(comparePermissionOverwrites(guild));
  return (await Promise.all(permsSorted.map(async (p) => {
    const lines = [];
    if (p.type === 'role') {
      const role = guild.roles.cache.get(p.id);
      lines.push(`    ${role.name}`);
    } else if (p.type === 'member') {
      const member = await guild.members.fetch(p.id);
      lines.push(chalk.cyan(`    ${member.user.username}#${member.user.discriminator}`));
    }
    p.allow.toArray().forEach((name) => lines.push(chalk.green(`      ✓ ${name}`)));
    p.deny.toArray().forEach((name) => lines.push(chalk.red(`      ✗ ${name}`)));
    return lines.join('\n');
  }))).join('\n');
}

async function logChannel(guild, channel) {
  return [
    chalk.yellow(`  #${channel.name}`),
    await logOverwrites(guild, channel.permissionOverwrites),
  ].join('\n');
}

async function logCategory(guild, { category, channels }) {
  channels.sort((a, b) => a.rawPosition - b.rawPosition);
  return [
    category.name,
    await logOverwrites(guild, category.permissionOverwrites),
    ...(await Promise.all(channels
      .filter((channel) => channel.permissionsLocked === false)
      .map((channel) => logChannel(guild, channel)))),
  ].join('\n');
}

async function run() {
  const guild = await client.guilds.fetch(process.env.GUILD);
  const categories = [...guild.channels.cache.values()]
    .filter((channel) => channel.type === 'category')
    .map((category) => ({ category, channels: [] }));
  guild.channels.cache.forEach((channel) => {
    if (channel.parentID && channel.permissionOverwrites) {
      categories.find(({ category }) => category.id === channel.parentID).channels.push(channel);
    }
  });
  categories.sort(({ category: a }, { category: b }) => a.rawPosition - b.rawPosition);
  console.log((await Promise.all(categories.map((c) => logCategory(guild, c)))).join('\n'));
}

client.on('ready', () => run().catch(console.error).finally(() => client.destroy()));
client.login(process.env.TOKEN);
