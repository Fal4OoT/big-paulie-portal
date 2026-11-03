using BigPaulie.Api.Auth;
using BigPaulie.Api.Discord;
using BigPaulie.Api.Infrastructure;
using Dapper;
using Npgsql;

namespace BigPaulie.Api.Services;

/// <summary>Journal d'audit : écrit en base et recopié dans le salon de logs Discord.</summary>
public sealed class AuditService
{
    private readonly NpgsqlDataSource _db;
    private readonly DiscordNotifier _notifier;
    private readonly ConfigService _config;
    private readonly PortalOptions _opt;

    public AuditService(NpgsqlDataSource db, DiscordNotifier notifier, ConfigService config, PortalOptions opt)
    {
        _db = db;
        _notifier = notifier;
        _config = config;
        _opt = opt;
    }

    /// <param name="action">Code court (ex : client.created) — sert aussi à choisir la couleur.</param>
    /// <param name="link">Chemin du portail (ex : /ventes/…) ajouté au message Discord.</param>
    public async Task LogAsync(CurrentUser? actor, string action, string entity, string? entityId, string title, string summary,
        string? link = null, NpgsqlConnection? conn = null, NpgsqlTransaction? tx = null)
    {
        var actorName = actor?.Name ?? "Système";
        var sql = """
            INSERT INTO audit_logs (actor_id, actor_name, action, entity, entity_id, summary)
            VALUES (@actorId, @actorName, @action, @entity, @entityId, @summary)
            """;
        var args = new { actorId = actor?.Id == Guid.Empty ? null : actor?.Id, actorName, action, entity, entityId, summary = $"{title} — {summary}" };

        if (conn is not null) await conn.ExecuteAsync(sql, args, tx);
        else
        {
            await using var c = await _db.OpenConnectionAsync();
            await c.ExecuteAsync(sql, args);
        }

        var settings = await _config.GetSettingsAsync();
        var color = action switch
        {
            _ when action.EndsWith(".deleted") || action.EndsWith(".cancelled") => DiscordNotifier.ColorRed,
            _ when action.EndsWith(".created") => DiscordNotifier.ColorGreen,
            _ when action.StartsWith("config.") => DiscordNotifier.ColorGrey,
            _ => DiscordNotifier.ColorSand,
        };
        var url = link is null ? null : $"{_opt.PublicUrl}{link}";
        var who = actor is null ? "Système" : actor.User.DiscordId.Length > 0 && actor.Id != Guid.Empty
            ? $"{actorName} (<@{actor.User.DiscordId}>)"
            : actorName;

        _notifier.Enqueue(settings.LogChannelId,
            DiscordNotifier.Embed(title, $"{summary}\n\n**Par :** {who}", color, footer: "Big Paulie · Logs", url: url));
    }
}
