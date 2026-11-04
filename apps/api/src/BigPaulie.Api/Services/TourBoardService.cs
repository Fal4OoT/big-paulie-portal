using System.Text.Json;
using System.Threading.Channels;
using BigPaulie.Api.Discord;
using BigPaulie.Api.Domain;
using Dapper;
using Npgsql;

namespace BigPaulie.Api.Services;

/// <summary>
/// Tableau de tournée : un seul message dans le salon de tournée.
/// <list type="bullet">
/// <item>Modifié en direct à chaque changement (aucune notification, aucun spam).</item>
/// <item>Reposté à chaque tournée, pour une vente immédiate ou sur demande : l'ancien est supprimé et le nouveau
/// mentionne les rôles concernés, ce qui déclenche la notification Discord.</item>
/// </list>
/// Toutes les actions passent par une file traitée une par une : pas de conflit entre deux modifications.
/// </summary>
public sealed class TourBoardService : BackgroundService
{
    public enum RepostReason { Slot, Immediate, Manual }

    private abstract record Command;
    private sealed record Refresh : Command;
    private sealed record Repost(RepostReason Reason, string Detail) : Command;

    private sealed class BoardState
    {
        public string? ChannelId { get; set; }
        public string? MessageId { get; set; }
    }

    private static readonly TimeSpan Debounce = TimeSpan.FromSeconds(3);

    private readonly Channel<Command> _queue = Channel.CreateUnbounded<Command>(new UnboundedChannelOptions { SingleReader = true });
    private readonly NpgsqlDataSource _db;
    private readonly ConfigService _config;
    private readonly TourService _tour;
    private readonly DiscordRestClient _discord;
    private readonly ILogger<TourBoardService> _log;

    public TourBoardService(NpgsqlDataSource db, ConfigService config, TourService tour, DiscordRestClient discord, ILogger<TourBoardService> log)
    {
        _db = db;
        _config = config;
        _tour = tour;
        _discord = discord;
        _log = log;
    }

    /// <summary>Met à jour le tableau (sans notification). Les demandes rapprochées sont regroupées.</summary>
    public void RequestRefresh() => _queue.Writer.TryWrite(new Refresh());

    /// <summary>Republie le tableau en bas du salon avec mention des rôles (notification).</summary>
    public void RequestRepost(RepostReason reason, string detail = "") => _queue.Writer.TryWrite(new Repost(reason, detail));

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            Command cmd;
            try { cmd = await _queue.Reader.ReadAsync(stoppingToken); }
            catch (OperationCanceledException) { break; }

            try
            {
                if (cmd is Refresh)
                {
                    // Regroupe les rafales (action groupée de la tournée, plusieurs clics…).
                    try { await Task.Delay(Debounce, stoppingToken); }
                    catch (OperationCanceledException) { break; }

                    // Les reposts arrivés entre-temps sont conservés (chacun notifie) ; ils mettent aussi le tableau à jour.
                    var reposts = new List<Repost>();
                    while (_queue.Reader.TryRead(out var next))
                        if (next is Repost r) reposts.Add(r);

                    if (reposts.Count == 0) await RefreshAsync(stoppingToken);
                    foreach (var r in reposts) await RepostAsync(r, stoppingToken);
                }
                else if (cmd is Repost repost)
                {
                    await RepostAsync(repost, stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Mise à jour du tableau de tournée impossible");
            }
        }
    }

    private async Task RefreshAsync(CancellationToken ct)
    {
        var settings = await _config.GetSettingsAsync();
        var state = await LoadStateAsync();
        if (string.IsNullOrEmpty(settings.TourChannelId))
        {
            await RemoveOldAsync(state, ct);
            return;
        }

        var now = DateTime.UtcNow;
        var data = await _tour.LoadBoardAsync(settings, now);
        // content vide : retire la mention du dernier repost (elle ne notifierait plus de toute façon).
        var payload = Payload("", data, settings, now, Array.Empty<string>());

        if (state.ChannelId == settings.TourChannelId && !string.IsNullOrEmpty(state.MessageId))
        {
            var result = await _discord.EditMessageAsync(state.ChannelId, state.MessageId, payload, ct);
            if (result == DiscordRestClient.EditResult.Ok) return;
            if (result == DiscordRestClient.EditResult.Failed) return; // panne passagère : on réessaiera au prochain changement
            // NotFound : le message a été supprimé à la main, on en publie un nouveau.
        }
        else
        {
            await RemoveOldAsync(state, ct); // salon changé dans la configuration
        }

        var id = await _discord.CreateMessageAsync(settings.TourChannelId, payload, ct);
        if (id is not null) await SaveStateAsync(new BoardState { ChannelId = settings.TourChannelId, MessageId = id });
    }

    private async Task RepostAsync(Repost cmd, CancellationToken ct)
    {
        var settings = await _config.GetSettingsAsync();
        var state = await LoadStateAsync();
        if (string.IsNullOrEmpty(settings.TourChannelId))
        {
            await RemoveOldAsync(state, ct);
            return;
        }

        var now = DateTime.UtcNow;
        var data = await _tour.LoadBoardAsync(settings, now);

        // À l'heure de la tournée : sans annonce automatique, ou s'il n'y a rien à faire, simple mise à jour.
        if (cmd.Reason == RepostReason.Slot && (!settings.TourEnabled || (data.ToDo == 0 && settings.TourSkipEmpty)))
        {
            await RefreshAsync(ct);
            return;
        }

        var roles = new List<string>();
        string header;
        switch (cmd.Reason)
        {
            case RepostReason.Immediate:
                AddRole(roles, settings.ImmediatePingRoleId);
                header = $"⚡ **Vente immédiate** {cmd.Detail} : à commander et aller chercher maintenant.";
                break;
            case RepostReason.Manual:
                AddRole(roles, settings.TourPingRoleId);
                header = $"📣 **Point tournée** : {data.ToOrder.Count} à commander, {data.ToFetch.Count} à chercher.";
                break;
            default:
                AddRole(roles, settings.TourPingRoleId);
                header = data.ToDo == 0
                    ? $"🕒 **Tournée de {cmd.Detail}** : rien à faire."
                    : $"🕒 **Tournée de {cmd.Detail}** : {data.ToOrder.Count} à commander, {data.ToFetch.Count} à chercher.";
                break;
        }

        if (data.Late.Count > 0 && cmd.Reason != RepostReason.Immediate)
        {
            AddRole(roles, settings.TourLateRoleId);
            header += $"\n⏰ **{data.Late.Count} véhicule(s) en retard** (plus de {settings.TourLateAfter} tournées d'attente).";
        }

        var mentions = string.Join(' ', roles.Select(r => $"<@&{r}>"));
        var content = mentions.Length > 0 ? $"{mentions}\n{header}" : header;

        // Nouveau message d'abord (le salon n'est jamais vide), puis suppression de l'ancien.
        var id = await _discord.CreateMessageAsync(settings.TourChannelId, Payload(content, data, settings, now, roles.ToArray()), ct);
        if (id is null) return;
        await RemoveOldAsync(state, ct);
        await SaveStateAsync(new BoardState { ChannelId = settings.TourChannelId, MessageId = id });
    }

    private object Payload(string content, TourService.BoardData data, PortalSettings settings, DateTime now, string[] pingRoles) => new
    {
        Content = content,
        Embeds = new[] { _tour.BuildBoardEmbed(data, settings, now) },
        AllowedMentions = new { Parse = Array.Empty<string>(), Roles = pingRoles },
    };

    private static void AddRole(List<string> roles, string? roleId)
    {
        if (!string.IsNullOrEmpty(roleId) && !roles.Contains(roleId)) roles.Add(roleId);
    }

    private async Task RemoveOldAsync(BoardState state, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(state.ChannelId) || string.IsNullOrEmpty(state.MessageId)) return;
        await _discord.DeleteMessageAsync(state.ChannelId, state.MessageId, ct);
        await SaveStateAsync(new BoardState());
    }

    // L'identifiant du message est stocké à part des réglages (clé « tour_board ») :
    // un enregistrement de la configuration ne peut pas l'écraser.
    private async Task<BoardState> LoadStateAsync()
    {
        await using var c = await _db.OpenConnectionAsync();
        var json = await c.ExecuteScalarAsync<string?>("SELECT value::text FROM settings WHERE key = 'tour_board'");
        return json is null ? new BoardState() : JsonSerializer.Deserialize<BoardState>(json, ConfigService.Json) ?? new BoardState();
    }

    private async Task SaveStateAsync(BoardState state)
    {
        await using var c = await _db.OpenConnectionAsync();
        await c.ExecuteAsync(
            "INSERT INTO settings (key, value) VALUES ('tour_board', @v::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            new { v = JsonSerializer.Serialize(state, ConfigService.Json) });
    }
}
