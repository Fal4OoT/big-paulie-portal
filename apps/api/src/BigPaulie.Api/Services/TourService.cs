using BigPaulie.Api.Discord;
using BigPaulie.Api.Domain;
using BigPaulie.Api.Endpoints;
using BigPaulie.Api.Infrastructure;
using Dapper;
using Npgsql;

namespace BigPaulie.Api.Services;

/// <summary>Tournées : toutes les 30 minutes (heure réelle, xxh00 et xxh30), on commande et on va chercher ce qui attend.</summary>
public sealed class TourService
{
    private const int SlotSeconds = 30 * 60;

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
        // Passage heure d'été/hiver : une heure locale inexistante est décalée.
        while (_tz.IsInvalidTime(slot)) slot = slot.AddMinutes(30);
        return TimeZoneInfo.ConvertTimeToUtc(slot, _tz);
    }

    public string LocalHour(DateTime utc) => TimeZoneInfo.ConvertTimeFromUtc(utc, _tz).ToString("HH'h'mm");

    /// <summary>
    /// Nombre de tournées passées depuis la vente. Les tranches xxh00/xxh30 de Paris tombent aussi
    /// sur xxh00/xxh30 en UTC (décalage d'heures entières), d'où le calcul direct.
    /// </summary>
    public static int ToursWaited(DateTime createdUtc, DateTime nowUtc)
    {
        static long Slot(DateTime d) => new DateTimeOffset(DateTime.SpecifyKind(d, DateTimeKind.Utc)).ToUnixTimeSeconds() / SlotSeconds;
        return (int)Math.Max(0, Slot(nowUtc) - Slot(createdUtc));
    }

    public static bool IsLate(SaleView s, PortalSettings settings, DateTime nowUtc) =>
        settings.TourLateAfter > 0
        && (s.Status == SaleStatus.ToOrder || s.Status == SaleStatus.ToFetch)
        && ToursWaited(s.CreatedAt, nowUtc) > settings.TourLateAfter;

    public async Task<List<SaleView>> PendingAsync(params string[] statuses)
    {
        await using var c = await _db.OpenConnectionAsync();
        return (await c.QueryAsync<SaleView>(
            $"{SaleEndpoints.SelectSale} WHERE c.deleted_at IS NULL AND s.status = ANY(@statuses) ORDER BY s.immediate DESC, s.created_at",
            new { statuses })).ToList();
    }

    public static string Line(SaleView s) =>
        $"{(s.Immediate ? "⚡ " : "")}**{SaleEndpoints.Ref(s.Number)}** · {s.VehicleName} ({s.VehicleTypeLabel}) — {s.ClientName}";

    private string Line(SaleView s, PortalSettings settings, DateTime nowUtc)
    {
        var line = Line(s);
        if (s.Status == SaleStatus.Received && s.DeliveryAt is { } at) line += $" · 🕘 RDV {Appointment(at, nowUtc)}";
        if (!IsLate(s, settings, nowUtc)) return line;
        return $"⏰ {line} · *{ToursWaited(s.CreatedAt, nowUtc)} tournées*";
    }

    /// <summary>« 21h30 » le jour même, sinon « 12/11 21h30 ».</summary>
    public string Appointment(DateTime utc, DateTime nowUtc)
    {
        var local = TimeZoneInfo.ConvertTimeFromUtc(utc, _tz);
        var today = TimeZoneInfo.ConvertTimeFromUtc(nowUtc, _tz).Date;
        return local.Date == today ? local.ToString("HH'h'mm") : local.ToString("dd/MM HH'h'mm");
    }

    public sealed record BoardData(List<SaleView> ToOrder, List<SaleView> ToFetch, List<SaleView> Received, List<SaleView> Late)
    {
        public int ToDo => ToOrder.Count + ToFetch.Count;
    }

    public async Task<BoardData> LoadBoardAsync(PortalSettings settings, DateTime nowUtc)
    {
        var pending = await PendingAsync(SaleStatus.ToOrder, SaleStatus.ToFetch, SaleStatus.Received);
        return new BoardData(
            pending.Where(s => s.Status == SaleStatus.ToOrder).ToList(),
            pending.Where(s => s.Status == SaleStatus.ToFetch).ToList(),
            // À livrer : les rendez-vous d'abord (par heure), puis le reste.
            pending.Where(s => s.Status == SaleStatus.Received)
                   .OrderBy(s => s.DeliveryAt is null).ThenBy(s => s.DeliveryAt).ThenByDescending(s => s.Immediate).ThenBy(s => s.CreatedAt).ToList(),
            pending.Where(s => IsLate(s, settings, nowUtc)).ToList());
    }

    /// <summary>Embed du tableau de tournée (le message unique du salon).</summary>
    public object BuildBoardEmbed(BoardData d, PortalSettings settings, DateTime nowUtc)
    {
        var next = NextSlotUtc(nowUtc);
        var summary = d.ToDo + d.Received.Count == 0
            ? "Rien à commander, à chercher ni à livrer. 👌"
            : $"{d.ToOrder.Count} à commander · {d.ToFetch.Count} à chercher · {d.Received.Count} à livrer";
        if (d.Late.Count > 0)
            summary += $"\n⏰ **{d.Late.Count} véhicule(s) en retard** (plus de {settings.TourLateAfter} tournées d'attente)";

        return new
        {
            Title = "🚚 Tableau de tournée",
            Url = $"{_opt.PublicUrl}/tournee",
            Description = $"Prochaine tournée : **{LocalHour(next)}**\n{summary}",
            Color = d.Late.Count > 0 ? DiscordNotifier.ColorOrange : DiscordNotifier.ColorRed,
            Timestamp = nowUtc.ToString("o"),
            Footer = new { Text = "Big Paulie · mis à jour automatiquement" },
            Fields = new[]
            {
                Field($"📦 {settings.StatusLabel(SaleStatus.ToOrder)} ({d.ToOrder.Count})", d.ToOrder, settings, nowUtc),
                Field($"🚚 {settings.StatusLabel(SaleStatus.ToFetch)} ({d.ToFetch.Count})", d.ToFetch, settings, nowUtc),
                Field($"🏁 {settings.StatusLabel(SaleStatus.Received)} ({d.Received.Count})", d.Received, settings, nowUtc),
            },
        };
    }

    private object Field(string name, List<SaleView> sales, PortalSettings settings, DateTime nowUtc) => new
    {
        Name = name,
        Value = DiscordNotifier.BulletList(sales.Select(s => Line(s, settings, nowUtc)).ToList()),
        Inline = false,
    };
}

public sealed class TourSchedulerService : BackgroundService
{
    private readonly TourService _tour;
    private readonly TourBoardService _board;
    private readonly ILogger<TourSchedulerService> _log;

    public TourSchedulerService(TourService tour, TourBoardService board, ILogger<TourSchedulerService> log)
    {
        _tour = tour;
        _board = board;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _log.LogInformation("Planificateur de tournées démarré (fuseau {Tz}).", _tour.TimeZone.Id);
        _board.RequestRefresh(); // remet le tableau à jour après un redémarrage

        while (!stoppingToken.IsCancellationRequested)
        {
            var next = _tour.NextSlotUtc(DateTime.UtcNow);
            var delay = next - DateTime.UtcNow;
            if (delay > TimeSpan.Zero)
            {
                try { await Task.Delay(delay, stoppingToken); }
                catch (OperationCanceledException) { break; }
            }

            _board.RequestRepost(TourBoardService.RepostReason.Slot, _tour.LocalHour(next));

            // Évite un double déclenchement si l'horloge saute légèrement.
            try { await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }
}
