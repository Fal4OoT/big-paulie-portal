namespace BigPaulie.Api.Infrastructure;

/// <summary>Configuration lue depuis les variables d'environnement (voir .env.example).</summary>
public sealed class PortalOptions
{
    /// <summary>URL publique du portail, sans slash final (ex : https://bigpaulie.falaoot.fr).</summary>
    public string PublicUrl { get; set; } = "http://localhost:8081";

    public string DiscordClientId { get; set; } = "";
    public string DiscordClientSecret { get; set; } = "";
    public string DiscordBotToken { get; set; } = "";
    public string DiscordGuildId { get; set; } = "";

    /// <summary>IDs Discord ayant tous les droits (amorçage avant d'avoir lié les grades).</summary>
    public string[] AdminDiscordIds { get; set; } = Array.Empty<string>();

    /// <summary>Clé partagée entre l'API et le bot.</summary>
    public string InternalApiKey { get; set; } = "";

    public string TimeZone { get; set; } = "Europe/Paris";

    public string RedirectUri => $"{PublicUrl.TrimEnd('/')}/api/auth/callback";
    public bool IsHttps => PublicUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase);

    public static PortalOptions FromEnvironment(IConfiguration cfg)
    {
        string Get(string key, string fallback = "") => (cfg[key] ?? fallback).Trim();

        return new PortalOptions
        {
            PublicUrl = Get("PUBLIC_URL", "http://localhost:8081").TrimEnd('/'),
            DiscordClientId = Get("DISCORD_CLIENT_ID"),
            DiscordClientSecret = Get("DISCORD_CLIENT_SECRET"),
            DiscordBotToken = Get("DISCORD_BOT_TOKEN"),
            DiscordGuildId = Get("DISCORD_GUILD_ID"),
            AdminDiscordIds = Get("ADMIN_DISCORD_IDS")
                .Split(new[] { ',', ';', ' ' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
            InternalApiKey = Get("INTERNAL_API_KEY"),
            TimeZone = Get("PORTAL_TIMEZONE", "Europe/Paris"),
        };
    }
}
