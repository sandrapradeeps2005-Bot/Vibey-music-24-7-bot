require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    SlashCommandBuilder,
    Routes
} = require('discord.js');

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    entersState,
    VoiceConnectionStatus
} = require('@discordjs/voice');

const play = require('play-dl');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const queue = new Map();

client.once('ready', async () => {
    console.log(`${client.user.tag} online`);

    const commands = [
        new SlashCommandBuilder()
            .setName('play')
            .setDescription('Play a song')
            .addStringOption(option =>
                option
                    .setName('query')
                    .setDescription('Song name or YouTube URL')
                    .setRequired(true)
            ),

        new SlashCommandBuilder()
            .setName('skip')
            .setDescription('Skip current song'),

        new SlashCommandBuilder()
            .setName('stop')
            .setDescription('Stop music')
    ].map(cmd => cmd.toJSON());

    await client.application.commands.set(commands);

    console.log('Slash commands registered');
});

async function playSong(guild, song) {

    const serverQueue = queue.get(guild.id);

    if (!song) {
        serverQueue.connection.destroy();
        queue.delete(guild.id);
        return;
    }

    const stream = await play.stream(song.url);

    const resource = createAudioResource(stream.stream, {
        inputType: stream.type
    });

    serverQueue.player.play(resource);

    serverQueue.textChannel.send(`🎵 Now playing: **${song.title}**`);
}

client.on('interactionCreate', async interaction => {

    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'play') {

        const query = interaction.options.getString('query');
        const voiceChannel = interaction.member.voice.channel;

        if (!voiceChannel) {
            return interaction.reply({
                content: 'Join a voice channel first',
                ephemeral: true
            });
        }

        await interaction.deferReply();

        let song;

        if (play.yt_validate(query) === 'video') {

            const info = await play.video_info(query);

            song = {
                title: info.video_details.title,
                url: info.video_details.url
            };

        } else {

            const results = await play.search(query, {
                limit: 1
            });

            if (!results.length) {
                return interaction.editReply('No results found');
            }

            song = {
                title: results[0].title,
                url: results[0].url
            };
        }

        let serverQueue = queue.get(interaction.guild.id);

        if (!serverQueue) {

            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: interaction.guild.id,
                adapterCreator: interaction.guild.voiceAdapterCreator
            });

            const player = createAudioPlayer();

            connection.subscribe(player);

            serverQueue = {
                textChannel: interaction.channel,
                voiceChannel,
                connection,
                player,
                songs: []
            };

            queue.set(interaction.guild.id, serverQueue);

            player.on(AudioPlayerStatus.Idle, () => {
                serverQueue.songs.shift();
                playSong(interaction.guild, serverQueue.songs[0]);
            });

            connection.on(VoiceConnectionStatus.Disconnected, async () => {
                try {
                    await Promise.race([
                        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
                        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
                    ]);
                } catch {
                    connection.destroy();
                }
            });
        }

        serverQueue.songs.push(song);

        if (serverQueue.songs.length === 1) {
            playSong(interaction.guild, serverQueue.songs[0]);
        }

        interaction.editReply(`Added **${song.title}** to queue`);
    }

    else if (commandName === 'skip') {

        const serverQueue = queue.get(interaction.guild.id);

        if (!serverQueue) {
            return interaction.reply('No music playing');
        }

        serverQueue.player.stop();

        interaction.reply('⏭ Skipped');
    }

    else if (commandName === 'stop') {

        const serverQueue = queue.get(interaction.guild.id);

        if (!serverQueue) {
            return interaction.reply('No music playing');
        }

        serverQueue.songs = [];
        serverQueue.player.stop();
        serverQueue.connection.destroy();

        queue.delete(interaction.guild.id);

        interaction.reply('⏹ Music stopped');
    }
});

client.login(process.env.TOKEN);
