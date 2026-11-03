using BigPaulie.Api.Auth;
using BigPaulie.Api.Discord;
using BigPaulie.Api.Domain;
using BigPaulie.Api.Endpoints;
using BigPaulie.Api.Infrastructure;
using Dapper;
using Npgsql;

namespace BigPaulie.Api.Services;

/// <summary>Tournées : toutes les 30 minutes (heure réelle, xxh00 et xxh30), liste de ce qu'il faut commander et aller chercher.</summary>
public sealed class TourService
{
    private readonly NpgsqlDataSource _db;
    private readonly PortalOptions _opt;
    private readonly TimeZoneInfo _tz;

    public TourService(NpgsqlDataSource db, PortalOptions opt)
    {
        _db = db;
        _opt = opt;
        _tz = ResolveTimeZone(opt.TimeZone);
    }

    public TimeZoneInfo TimeZone => _tz;

    public static TimeZoneInfo ResolveTimeZone(string id)
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
        catch { return TimeZoneInfo.Utc; }
    }

    /// <summary>Prochaine tranche (strictement après <paramref name="utcNow"/>), en UTC.</summary>
    public DateTime NextSlotUtc(DateTime utcNow)
    {
        var local = TimeZoneInfo.ConvertTimeFromUtc(utcNow, _tz);
        var slot = new DateTime(local.Year, local.Month, local.Day, local.Hour, local.Minute >= 30 ? 30 : 0, 0, DateTimeKind.Unspecified)
            .AddMinutes(30);
        // Passage heure d'été/hiver : une heure locale inexistante est décalée d'une heure.
        while (_tz.IsInvalidTime(slot)) slot = slot.AddMinutes(30);
        return TimeZoneInfo.ConvertTimeToUtc(slot, _tz);
    }

    public string LocalHour(DateTime utc) => TimeZoneInfo.ConvertTimeFromUtc(utc, _tz).ToString("HH'h'mm");

    public async Task<List<SaleView>> PendingAsync(params string[] statuses)
    {
        await using var c = await _db.OpenConnectionAsync();
        return (await c.QueryAsync<SaleView>(
            $"{SaleEndpoints.SelectSale} WHERE c.deleted_at IS NULL AND s.status = ANY(@statuses) ORDER BY s.immediate DESC, s.created_at",
            new { statuses })).ToList();
    }

    public static string Line(SaleView s) =>
        $"{(s.Immediate ? "⚡ " : "")}**{SaleEndpoints.Ref(s.Number)}** · {s.VehicleName} ({s.VehicleTypeLabel}) — {s.ClientName}";

    public object BuildMessage(string title, List<SaleView> toOrder, List<SaleView> toFetch, PortalSettings settings)
    {
        var role = settings.TourPingRoleId;
        return DiscordNotifier.Embed(
            title,
            toOrder.Count + toFetch.Count == 0
                ? "Rien à commander ni à aller chercher. 👌"
                : $"{toOrder.Count} à commander · {toFetch.Count} à aller chercher.",
            DiscordNotifier.ColorRed,
            footer: "Big Paulie · Tournée",
            url: $"{_opt.PublicUrl}/tournee",
            fields: new[]
            {
                ($"📦 {settings.StatusLabel(SaleStatus.ToOrder)} ({toOrder.Count})", DiscordNotifier.BulletList(toOrder.Select(Line).ToList())),
                ($"🚚 {settings.StatusLabel(SaleStatus.ToFetch)} ({toFetch.Count})", DiscordNotifier.BulletList(toFetch.Select(Line).ToList())),
            },
            content: string.IsNullOrEmpty(role) ? null : $"<@&{role}>",
            pingRoleIds: string.IsNullOrEmpty(role) ? null : new[] { role });
    }
}

public sealed class TourSchedulerService : BackgroundService
{
    private readonly TourService _tour;
    private readonly ConfigService _config;
    private readonly DiscordNotifier _notifier;
    private readonly ILogger<TourSchedulerService> _log;

    public TourSchedulerService(TourService tour, ConfigService config, DiscordNotifier notifier, ILogger<TourSchedulerService> log)
    {
        _tour = tour;
        _config = config;
        _notifier = notifier;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _log.LogInformation("Planificateur de tournées démarré (fuseau {Tz}).", _tour.TimeZone.Id);
        while (!stoppingToken.IsCancellationRequested)
        {
            var next = _tour.NextSlotUtc(DateTime.UtcNow);
            var delay = next - DateTime.UtcNow;
            if (delay > TimeSpan.Zero)
            {
                try { await Task.Delay(delay, stoppingToken); }
                catch (OperationCanceledException) { break; }
            }

            try
            {
                var settings = await _config.GetSettingsAsync();
                if (!settings.TourEnabled || string.IsNullOrEmpty(settings.TourChannelId)) continue;

                var pending = await _tour.PendingAsync(SaleStatus.ToOrder, SaleStatus.ToFetch);
                var toOrder = pending.Where(s => s.Status == SaleStatus.ToOrder).ToList();
                var toFetch = pending.Where(s => s.Status == SaleStatus.ToFetch).ToList();
                if (pending.Count == 0 && settings.TourSkipEmpty) continue;

                _notifier.Enqueue(settings.TourChannelId,
                    _tour.BuildMessage($"🕒 Tournée de {_tour.LocalHour(next)}", toOrder, toFetch, settings));
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Erreur pendant la tournée de {Slot}", next);
            }

            // Évite un double envoi si l'horloge saute légèrement.
            try { await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }
}
