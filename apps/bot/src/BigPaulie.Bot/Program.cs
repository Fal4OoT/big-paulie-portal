using System.Reflection;
using BigPaulie.Bot;
using Discord;
using Discord.Interactions;
using Discord.WebSocket;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

var options = BotOptions.FromEnvironment();

var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddSingleton(options);
builder.Services.AddSingleton(new DiscordSocketClient(new DiscordSocketConfig
{
    // Aucune intention privilégiée : le bot ne lit pas les messages, il répond aux commandes slash.
    GatewayIntents = GatewayIntents.Guilds,
    LogLevel = LogSeverity.Info,
}));
builder.Services.AddSingleton(sp => new InteractionService(sp.GetRequiredService<DiscordSocketClient>().Rest,
    new InteractionServiceConfig { DefaultRunMode = RunMode.Async, UseCompiledLambda = true }));
builder.Services.AddHttpClient<PortalApi>();
builder.Services.AddHostedService<BotService>();

await builder.Build().RunAsync();

namespace BigPaulie.Bot
{
    public sealed class BotOptions
    {
        public string Token { get; init; } = "";
        public ulong GuildId { get; init; }
        public string ApiUrl { get; init; } = "http://api:8080";
        public string InternalApiKey { get; init; } = "";
        public string PublicUrl { get; init; } = "http://localhost:8081";

        public static BotOptions FromEnvironment()
        {
            string Env(string k, string fallback = "") => (Environment.GetEnvironmentVariable(k) ?? fallback).Trim();
            ulong.TryParse(Env("DISCORD_GUILD_ID"), out var guild);
            return new BotOptions
            {
                Token = Env("DISCORD_BOT_TOKEN"),
                GuildId = guild,
                ApiUrl = Env("API_INTERNAL_URL", "http://api:8080"),
                InternalApiKey = Env("INTERNAL_API_KEY"),
                PublicUrl = Env("PUBLIC_URL", "http://localhost:8081").TrimEnd('/'),
            };
        }
    }

    public sealed class BotService : IHostedService
    {
        private readonly DiscordSocketClient _client;
        private readonly InteractionService _interactions;
        private readonly IServiceProvider _services;
        private readonly BotOptions _opt;
        private readonly ILogger<BotService> _log;

        public BotService(DiscordSocketClient client, InteractionService interactions, IServiceProvider services,
            BotOptions opt, ILogger<BotService> log)
        {
            _client = client;
            _interactions = interactions;
            _services = services;
            _opt = opt;
            _log = log;
        }

        public async Task StartAsync(CancellationToken cancellationToken)
        {
            if (string.IsNullOrEmpty(_opt.Token) || _opt.GuildId == 0)
            {
                _log.LogError("DISCORD_BOT_TOKEN ou DISCORD_GUILD_ID manquant : le bot ne démarre pas.");
                return;
            }

            _client.Log += m => Log(m);
            _interactions.Log += m => Log(m);

            await _interactions.AddModulesAsync(Assembly.GetExecutingAssembly(), _services);

            _client.Ready += async () =>
            {
                // Commandes enregistrées sur le serveur uniquement (disponibles immédiatement).
                await _interactions.RegisterCommandsToGuildAsync(_opt.GuildId, deleteMissing: true);
                _log.LogInformation("Commandes slash enregistrées sur le serveur {Guild}.", _opt.GuildId);
            };

            _client.InteractionCreated += async interaction =>
            {
                var ctx = new SocketInteractionContext(_client, interaction);
                var result = await _interactions.ExecuteCommandAsync(ctx, _services);
                if (!result.IsSuccess) _log.LogWarning("Commande en échec : {Error}", result.ErrorReason);
            };

            await _client.LoginAsync(TokenType.Bot, _opt.Token);
            await _client.StartAsync();
        }

        public async Task StopAsync(CancellationToken cancellationToken)
        {
            await _client.StopAsync();
            await _client.LogoutAsync();
        }

        private Task Log(LogMessage m)
        {
            var level = m.Severity switch
            {
                LogSeverity.Critical => LogLevel.Critical,
                LogSeverity.Error => LogLevel.Error,
                LogSeverity.Warning => LogLevel.Warning,
                LogSeverity.Info => LogLevel.Information,
                _ => LogLevel.Debug,
            };
            _log.Log(level, m.Exception, "[{Source}] {Message}", m.Source, m.Message);
            return Task.CompletedTask;
        }
    }
}
